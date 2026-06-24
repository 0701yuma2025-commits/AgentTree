-- ============================================================
-- 005_delete_test_admins.sql  (DESTRUCTIVE / 本番データを削除します)
-- 不要なテスト管理者アカウント2件を、アプリ層(public.users)と
-- 認証層(auth.users)の両方から削除する。
-- 事前確認(diag)で参照ブロッカー0件・紐づく代理店なしを確認済み。
-- 1トランザクション(all-or-nothing)。途中で失敗すれば全てロールバック。
-- ============================================================

BEGIN;

-- 1) アプリのロール行を削除
--    （CASCADE設定の子レコード: 通知/書類受信者 等は自動削除される）
DELETE FROM public.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');

-- 2) Supabase Auth のログイン情報を削除
--    （これでログイン不可に。auth スキーマ内の session/identity 等は CASCADE）
DELETE FROM auth.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');

COMMIT;

-- ── 確認（両方 0 になっていれば削除成功）─────────────────
SELECT 'public.users' AS layer, COUNT(*) AS remaining
FROM public.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com')
UNION ALL
SELECT 'auth.users' AS layer, COUNT(*) AS remaining
FROM auth.users
WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com');
