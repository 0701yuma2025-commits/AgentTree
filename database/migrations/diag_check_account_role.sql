-- ============================================================
-- diag_check_account_role.sql  (READ ONLY / 何も変更しません)
-- 「他系列が見える」原因の切り分け用。
-- ログイン中アカウントの role(admin/agency) を確認する。
-- ============================================================

-- 1) Test Admin (AGN20260001) の role を確認
--    user_role が 'admin' なら → 全系列表示は正常（管理者ロール）
--    user_role が 'agency' なら → 他系列が見えるのはバグ（要調査）
SELECT
  a.agency_code,
  a.company_name,
  a.tier_level,
  a.email          AS agency_email,
  u.role           AS user_role,
  u.is_active
FROM agencies a
LEFT JOIN users u ON u.email = a.email
WHERE a.agency_code = 'AGN20260001';

-- 2) 管理者ロールを持つアカウント一覧（誰が admin か）
SELECT email, role, is_active
FROM users
WHERE role = 'admin'
ORDER BY email;

-- 3) （任意）自分が実際にログインに使っているメールで直接確認したい場合は
--    下記の 'ここにログインメール' を置き換えて実行
-- SELECT email, role, is_active FROM users WHERE email = 'ここにログインメール';
