-- ============================================================
-- diag_admin_delete_impact.sql  (READ ONLY / 何も変更しません)
-- admin@agenttree.com と newadmin@agenttree.com を削除した場合の
-- 影響範囲（参照されているか）を確認する。
-- ============================================================

-- 対象ユーザーの基本情報（public.users）
SELECT id, email, role, is_active, last_login_at
FROM public.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');

-- 対象が Supabase Auth 側にも存在するか
SELECT id, email, last_sign_in_at, created_at
FROM auth.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');

-- 参照件数チェック（0件なら public.users をそのまま削除可能）
WITH targets AS (
  SELECT id FROM public.users
  WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com')
)
SELECT
  (SELECT COUNT(*) FROM sale_change_history WHERE changed_by IN (SELECT id FROM targets))      AS ref_sale_change_history,
  (SELECT COUNT(*) FROM audit_logs          WHERE user_id    IN (SELECT id FROM targets))      AS ref_audit_logs,
  (SELECT COUNT(*) FROM agencies            WHERE user_id    IN (SELECT id FROM targets))      AS ref_agencies_user_id;

-- commission_settings の作成者/更新者として参照されているか
WITH targets AS (
  SELECT id FROM public.users
  WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com')
)
SELECT
  (SELECT COUNT(*) FROM commission_settings WHERE created_by IN (SELECT id FROM targets)) AS cs_created_by,
  (SELECT COUNT(*) FROM commission_settings WHERE updated_by IN (SELECT id FROM targets)) AS cs_updated_by;

-- 対象メールに紐づく代理店レコード（存在すれば表示）
SELECT agency_code, company_name, tier_level, email, status
FROM agencies
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');
