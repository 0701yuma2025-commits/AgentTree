-- 010_add_commission_notes.sql
-- Add the missing notes column to commissions.
--
-- BACKGROUND:
--   PUT /api/commissions/:id/status (commissions.js) writes updateData.notes
--   when a `notes` value is provided, but the commissions table has no `notes`
--   column. When notes is supplied, PostgREST rejects the UPDATE and the request
--   returns HTTP 500. Adding the column fixes that path.
--
-- Non-destructive and idempotent: ADD COLUMN IF NOT EXISTS only.
-- DDL must be run in the Supabase SQL Editor (the SUPABASE_SERVICE_KEY is for
-- PostgREST and cannot run ALTER TABLE).

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS notes TEXT;
