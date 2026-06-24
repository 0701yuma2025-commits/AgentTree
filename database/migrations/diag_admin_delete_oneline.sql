-- READ ONLY / 1回実行して返る「1行」を貼ってください
WITH targets AS (
  SELECT id FROM public.users
  WHERE email IN ('admin@agenttree.com', 'newadmin@agenttree.com')
)
SELECT
  (SELECT COUNT(*) FROM public.users WHERE email IN ('admin@agenttree.com','newadmin@agenttree.com')) AS in_public_users,
  (SELECT COUNT(*) FROM auth.users   WHERE email IN ('admin@agenttree.com','newadmin@agenttree.com')) AS in_auth_users,
  (SELECT COUNT(*) FROM sale_change_history WHERE changed_by IN (SELECT id FROM targets))             AS ref_sale_change_history,
  (SELECT COUNT(*) FROM audit_logs          WHERE user_id    IN (SELECT id FROM targets))             AS ref_audit_logs,
  (SELECT COUNT(*) FROM agencies            WHERE user_id    IN (SELECT id FROM targets))             AS ref_agencies_user_id;
