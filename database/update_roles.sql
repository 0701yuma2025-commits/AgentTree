-- ロールを管理者と代理店のみに更新
-- 1. adminで始まるメールを管理者に更新
UPDATE users
SET role = 'admin'
WHERE email LIKE 'admin%';

-- 2. viewerロールを代理店に更新
UPDATE users
SET role = 'agency'
WHERE role = 'viewer';

-- 3. その他のロールも代理店に更新（管理者以外）
UPDATE users
SET role = 'agency'
WHERE role NOT IN ('admin', 'super_admin', 'agency');

-- 更新結果を確認
SELECT email, role, full_name
FROM users
ORDER BY role, email;