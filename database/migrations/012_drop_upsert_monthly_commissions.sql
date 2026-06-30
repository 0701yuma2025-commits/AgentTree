-- 012_drop_upsert_monthly_commissions.sql
-- Remove the dangerous, unused upsert_monthly_commissions RPC.
--
-- WHY:
--   upsert_monthly_commissions(p_month, p_commissions) deletes ALL commissions for
--   a month unconditionally (no approved/paid protection) before re-inserting. It is
--   not called from anywhere in the application (the safe replacement is
--   recalculate_commissions in 007, which deletes only non-finalized rows). Leaving
--   it in the database is a footgun: a stray call would wipe finalized commissions.
--
-- Safe and idempotent: DROP FUNCTION IF EXISTS. Run in the Supabase SQL Editor.

DROP FUNCTION IF EXISTS public.upsert_monthly_commissions(varchar, jsonb);
DROP FUNCTION IF EXISTS upsert_monthly_commissions(varchar, jsonb);
