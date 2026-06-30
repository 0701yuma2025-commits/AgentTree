-- 009_add_commission_payment_columns.sql
-- Add the payment/approval columns that the application writes to but that were
-- missing from the commissions table (code <-> schema drift).
--
-- BACKGROUND:
--   PUT /api/commissions/:id/pay writes paid_at / paid_by / payment_method /
--   transaction_id, and PUT /api/commissions/:id/approve writes approved_at /
--   approved_by. None of these columns existed in commissions, so PostgREST
--   rejected the UPDATE and every approve/pay returned HTTP 500 (status never
--   changed). This migration adds them.
--
-- STATUS: This SQL was already applied to the production Supabase database on
--   2026-06-30 via the SQL Editor (verified: the 6 columns exist in prod). It is
--   committed here only to keep the repository and the production schema in sync
--   (the file had been kept outside the repo). Re-running is safe.
--
-- Non-destructive and idempotent: ADD COLUMN IF NOT EXISTS only.
-- DDL must be run in the Supabase SQL Editor (the SUPABASE_SERVICE_KEY is for
-- PostgREST and cannot run ALTER TABLE).

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by        UUID,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    UUID;
