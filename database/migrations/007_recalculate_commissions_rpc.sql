-- 007_recalculate_commissions_rpc.sql
-- Atomic monthly commission recalculation.
--
-- Why:
--   The /api/commissions/calculate endpoint used a non-transactional
--   DELETE (by month) followed by INSERT. If the INSERT failed, every
--   commission for that month was lost. It also deleted finalized
--   (approved/paid) rows and recomputed them, which must not be changed.
--
-- This function wraps DELETE + INSERT in a single transaction (plpgsql
-- function body is atomic): finalized rows are preserved, non-finalized
-- rows are replaced by the supplied rows. The application is responsible
-- for excluding rows that collide with finalized (approved/paid) keys
-- before calling this function.
--
-- Idempotent: safe to run multiple times (CREATE OR REPLACE).
-- service_role is used by the API, so no extra GRANT is required, but we
-- keep SECURITY DEFINER so behavior is stable regardless of caller role.

CREATE OR REPLACE FUNCTION public.recalculate_commissions(
  p_month text,
  p_rows  jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  -- Remove only non-finalized commissions for the target month.
  -- Finalized rows (approved/paid) are intentionally preserved.
  DELETE FROM public.commissions
  WHERE month = p_month
    AND status NOT IN ('approved', 'paid');

  -- Insert the supplied rows. jsonb_populate_recordset casts each json
  -- object to the commissions row type, so column types stay correct
  -- without manual type declarations. Columns not listed (id, created_at,
  -- updated_at, etc.) fall back to their table defaults.
  INSERT INTO public.commissions (
    agency_id, sale_id, month, base_amount, tier_bonus, campaign_bonus,
    final_amount, status, tier_level, withholding_tax,
    carry_forward_reason, calculation_details
  )
  SELECT
    agency_id, sale_id, month, base_amount, tier_bonus, campaign_bonus,
    final_amount, status, tier_level, withholding_tax,
    carry_forward_reason, calculation_details
  FROM jsonb_populate_recordset(null::public.commissions, p_rows);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
