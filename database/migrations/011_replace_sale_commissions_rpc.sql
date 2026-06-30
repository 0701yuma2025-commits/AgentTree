-- 011_replace_sale_commissions_rpc.sql
-- Atomic replace of a single sale's commissions (used by sale update / recalc).
--
-- BACKGROUND:
--   PUT /api/sales/:id recalculated commissions with per-row UPDATEs in a loop:
--     - parent bonus rows whose agency no longer matched were left stale (K3 ghost rows),
--       and newly-added parents were never created;
--     - the N individual UPDATEs were non-transactional (K4): a mid-loop failure left
--       the sale's commissions partially updated / inconsistent.
--   The application now rebuilds the full record set and calls this function to
--   atomically delete the non-finalized rows for the sale and insert the new ones.
--
--   Finalized rows (approved/paid) are preserved (the app also refuses recalc when any
--   exist, but this is a second line of defense).
--
-- Idempotent: CREATE OR REPLACE. jsonb_populate_recordset casts each json object to the
-- commissions row type so column types stay correct without manual declarations.
-- DDL must be run in the Supabase SQL Editor (SERVICE_KEY/PostgREST cannot run it).

CREATE OR REPLACE FUNCTION public.replace_sale_commissions(
  p_sale_id uuid,
  p_rows    jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  DELETE FROM public.commissions
  WHERE sale_id = p_sale_id
    AND status NOT IN ('approved', 'paid');

  INSERT INTO public.commissions (
    agency_id, sale_id, month, base_amount, tier_bonus, campaign_bonus,
    final_amount, status, tier_level, withholding_tax, calculation_details
  )
  SELECT
    agency_id, sale_id, month, base_amount, tier_bonus, campaign_bonus,
    final_amount, status, tier_level, withholding_tax, calculation_details
  FROM jsonb_populate_recordset(null::public.commissions, p_rows);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
