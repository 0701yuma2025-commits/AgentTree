-- 013_unique_commission_sale_agency.sql
-- Prevent duplicate commission rows at the database level (G2).
--
-- WHY:
--   commissions had only a PK (id) and no uniqueness on the business key, so nothing
--   stopped duplicate INSERTs for the same (sale_id, agency_id). The only safeguard was
--   each code path deleting the month/sale's rows before re-inserting; a missed delete
--   (or the carried_forward month-rewrite) could leave the same (sale_id, agency_id)
--   duplicated across months.
--
-- KEY CHOICE:
--   For a single sale, the selling agency gets exactly one base row and each ancestor
--   gets exactly one hierarchy-bonus row, all with distinct agency_id (the parent chain
--   has cycle protection). So (sale_id, agency_id) is unique per sale and stays stable
--   even when the carried_forward sweep changes `month`. A PARTIAL index (sale_id NOT
--   NULL) skips legacy rows that have no sale_id.
--
-- SAFETY:
--   All recalc paths DELETE before INSERT and exclude approved/paid keys
--   (recalculate_commissions / replace_sale_commissions), and the sale-update path skips
--   recalc entirely when finalized rows exist, so no current path can hit this constraint.
--   Per the 2026-06-30 audit there are 0 existing duplicates. If a future run reports a
--   unique violation here, dedupe first, then create the index.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS. Run in the Supabase SQL Editor.

CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_sale_agency
  ON public.commissions (sale_id, agency_id)
  WHERE sale_id IS NOT NULL;
