-- =====================================================
-- データ整合性制約の追加
-- 不足しているCHECK制約を追加
--
-- Supabase SQL Editor で実行してください。
-- IF NOT EXISTS 相当の DO $$ ブロックで安全に実行可能。
-- =====================================================

-- ===== 1. sales テーブル =====

-- 数量は正の整数
ALTER TABLE sales
  ADD CONSTRAINT chk_sales_quantity_positive
  CHECK (quantity > 0);

-- 単価は0以上
ALTER TABLE sales
  ADD CONSTRAINT chk_sales_unit_price_positive
  CHECK (unit_price >= 0);

-- 合計金額は0以上
ALTER TABLE sales
  ADD CONSTRAINT chk_sales_total_amount_positive
  CHECK (total_amount >= 0);

-- ステータスは既知の値のみ
ALTER TABLE sales
  ADD CONSTRAINT chk_sales_status_valid
  CHECK (status IN ('pending', 'confirmed', 'cancelled'));

-- ===== 2. commissions テーブル =====

-- 基本報酬額は0以上
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_base_amount_positive
  CHECK (base_amount >= 0);

-- 最終報酬額は0以上（源泉徴収後もマイナスにはならない想定）
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_final_amount_positive
  CHECK (final_amount >= 0);

-- ティアボーナスは0以上
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_tier_bonus_positive
  CHECK (tier_bonus >= 0);

-- キャンペーンボーナスは0以上
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_campaign_bonus_positive
  CHECK (campaign_bonus >= 0);

-- 源泉徴収額は0以上
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commissions' AND column_name = 'withholding_tax'
  ) THEN
    EXECUTE 'ALTER TABLE commissions ADD CONSTRAINT chk_commissions_withholding_tax_positive CHECK (withholding_tax >= 0)';
  END IF;
END $$;

-- ステータスは既知の値のみ
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_status_valid
  CHECK (status IN ('pending', 'approved', 'paid'));

-- monthフォーマット: YYYY-MM
ALTER TABLE commissions
  ADD CONSTRAINT chk_commissions_month_format
  CHECK (month IS NULL OR month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- ===== 3. campaigns テーブル =====

-- 開始日 <= 終了日
ALTER TABLE campaigns
  ADD CONSTRAINT chk_campaigns_date_range
  CHECK (start_date <= end_date);

-- ボーナス率は0-100の範囲
ALTER TABLE campaigns
  ADD CONSTRAINT chk_campaigns_bonus_rate_range
  CHECK (bonus_rate IS NULL OR (bonus_rate >= 0 AND bonus_rate <= 100));

-- ボーナス金額は0以上
ALTER TABLE campaigns
  ADD CONSTRAINT chk_campaigns_bonus_amount_positive
  CHECK (bonus_amount IS NULL OR bonus_amount >= 0);

-- ===== 4. products テーブル =====

-- 価格は0以上
ALTER TABLE products
  ADD CONSTRAINT chk_products_price_positive
  CHECK (price >= 0);

-- 報酬率は0-100の範囲
ALTER TABLE products
  ADD CONSTRAINT chk_products_commission_rate_range
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));

-- ===== 5. payment_history テーブル =====

-- 支払額は正の値
ALTER TABLE payment_history
  ADD CONSTRAINT chk_payment_history_amount_positive
  CHECK (amount > 0);

-- ===== 6. agencies テーブル =====

-- ステータスは既知の値のみ
ALTER TABLE agencies
  ADD CONSTRAINT chk_agencies_status_valid
  CHECK (status IN ('pending', 'active', 'suspended'));

-- 報酬率は0-100の範囲
ALTER TABLE agencies
  ADD CONSTRAINT chk_agencies_commission_rate_range
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));

-- ===== 7. 便利なインデックス追加 =====

-- 売上: 代理店+日付の複合インデックス（期間レポートに使用）
CREATE INDEX IF NOT EXISTS idx_sales_agency_date
  ON sales(agency_id, sale_date DESC);

-- 報酬: 代理店+ステータス+月の複合インデックス（支払い処理に使用）
CREATE INDEX IF NOT EXISTS idx_commissions_agency_status_month
  ON commissions(agency_id, status, month);

-- 支払い: 代理店+日付の複合インデックス
CREATE INDEX IF NOT EXISTS idx_payment_history_agency_date
  ON payment_history(agency_id, payment_date DESC);

-- =====================================================
-- 確認用クエリ: 追加された制約の一覧
-- =====================================================
-- SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname LIKE 'chk_%'
-- ORDER BY conrelid::regclass::text, conname;
