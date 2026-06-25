-- ============================================================
-- diag_check_auth_email.sql  (READ ONLY - changes nothing)
-- Sending-side diagnostics for pabyo199@ichigo.me, ONE row result.
-- Paste into Supabase SQL Editor and RUN.
-- ============================================================

SELECT
  (u.id IS NOT NULL)                                   AS user_exists,
  u.email                                              AS stored_email,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.recovery_sent_at,                                  -- last password-reset mail timestamp
  (now() - u.recovery_sent_at)                         AS since_last_recovery,
  u.banned_until,                                      -- if set & future -> account blocked
  u.created_at,
  (SELECT COUNT(*) FROM auth.users)                    AS total_auth_users
FROM auth.users u
WHERE lower(u.email) = lower('pabyo199@ichigo.me');
