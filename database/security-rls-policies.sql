-- =====================================================
-- RLS (Row Level Security) ポリシー設定
-- 全主要テーブルにセキュリティポリシーを追加
--
-- 注意: このシステムはバックエンドから service_role key で
-- アクセスするため、RLSはバイパスされます。
-- このポリシーは anon key でフロントエンドから直接DBに
-- アクセスされた場合の防御層です。
--
-- Supabase SQL Editor で実行してください。
-- =====================================================

-- ===== 1. users テーブル =====
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 自分自身のレコードのみ閲覧可能
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (id = auth.uid());

-- 自分自身のレコードのみ更新可能
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT/DELETEは anon key では不可（service_role のみ）
-- デフォルトで拒否されるため明示的ポリシー不要

-- ===== 2. agencies テーブル =====
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- 自分の代理店 + 下位代理店のみ閲覧可能
-- (簡易版: 自分のuser_idに紐づく代理店のみ)
CREATE POLICY agencies_select_own ON agencies
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR parent_agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- 自分の代理店のみ更新可能
CREATE POLICY agencies_update_own ON agencies
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===== 3. sales テーブル =====
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- 自分の代理店の売上のみ閲覧可能
CREATE POLICY sales_select_own ON sales
  FOR SELECT
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- 自分の代理店の売上のみ作成可能
CREATE POLICY sales_insert_own ON sales
  FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- 自分の代理店の売上のみ更新可能
CREATE POLICY sales_update_own ON sales
  FOR UPDATE
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- ===== 4. commissions テーブル =====
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- 自分の代理店の報酬のみ閲覧可能
CREATE POLICY commissions_select_own ON commissions
  FOR SELECT
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETEは anon key では不可

-- ===== 5. payment_history テーブル =====
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- 自分の代理店の支払い履歴のみ閲覧可能
CREATE POLICY payment_history_select_own ON payment_history
  FOR SELECT
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- ===== 6. invitations テーブル =====
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- 自分の代理店からの招待のみ閲覧可能
CREATE POLICY invitations_select_own ON invitations
  FOR SELECT
  USING (
    inviter_agency_id IN (
      SELECT id FROM agencies WHERE user_id = auth.uid()
    )
  );

-- ===== 7. products テーブル =====
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 商品は全認証ユーザーが閲覧可能
CREATE POLICY products_select_all ON products
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ===== 8. campaigns テーブル =====
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- キャンペーンは全認証ユーザーが閲覧可能
CREATE POLICY campaigns_select_all ON campaigns
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ===== 9. notification_settings テーブル =====
-- テーブルが存在する場合のみ
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_settings') THEN
    EXECUTE 'ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY';

    EXECUTE '
      CREATE POLICY notification_settings_select_own ON notification_settings
        FOR SELECT
        USING (
          agency_id IN (
            SELECT id FROM agencies WHERE user_id = auth.uid()
          )
        )
    ';

    EXECUTE '
      CREATE POLICY notification_settings_update_own ON notification_settings
        FOR UPDATE
        USING (
          agency_id IN (
            SELECT id FROM agencies WHERE user_id = auth.uid()
          )
        )
    ';
  END IF;
END $$;

-- ===== 10. agency_documents テーブル =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_documents') THEN
    EXECUTE 'ALTER TABLE agency_documents ENABLE ROW LEVEL SECURITY';

    EXECUTE '
      CREATE POLICY agency_documents_select_own ON agency_documents
        FOR SELECT
        USING (
          agency_id IN (
            SELECT id FROM agencies WHERE user_id = auth.uid()
          )
        )
    ';
  END IF;
END $$;

-- ===== 11. document_recipients テーブル =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_recipients') THEN
    EXECUTE 'ALTER TABLE document_recipients ENABLE ROW LEVEL SECURITY';

    EXECUTE '
      CREATE POLICY document_recipients_select_own ON document_recipients
        FOR SELECT
        USING (
          user_id = auth.uid()
          OR user_id IS NULL
        )
    ';

    EXECUTE '
      CREATE POLICY document_recipients_insert_own ON document_recipients
        FOR INSERT
        WITH CHECK (user_id = auth.uid())
    ';

    EXECUTE '
      CREATE POLICY document_recipients_update_own ON document_recipients
        FOR UPDATE
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    ';

    EXECUTE '
      CREATE POLICY document_recipients_delete_own ON document_recipients
        FOR DELETE
        USING (user_id = auth.uid())
    ';
  END IF;
END $$;

-- =====================================================
-- 確認用クエリ: RLSが有効なテーブル一覧
-- =====================================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND rowsecurity = true;
