-- 014_promote_orphaned_agencies.sql
-- When a middle agency is deleted, automatically promote its subtree by one tier
-- and reattach the direct children to the grandparent (fill the hole). (#29)
--
-- WHY:
--   Previously agencies.parent_agency_id used ON DELETE SET NULL, so deleting a
--   middle agency (e.g. a Tier2) left its children orphaned (parent_agency_id NULL),
--   leaving a gap in the tree. The desired behavior is: the orphaned subtree moves
--   up one level and reattaches to the deleted agency's parent (the grandparent).
--
-- BEHAVIOR (example): T1 -> T2 -> T3 -> T4, delete T2
--   T3 becomes Tier2 with parent T1; T4 becomes Tier3; the whole branch shifts up by 1.
--   If the deleted agency is a top node (parent_agency_id NULL), its children become
--   new top nodes (parent NULL) at one tier higher.
--
-- NOTES:
--   - Runs as a BEFORE DELETE trigger so the reattach happens before the FK
--     ON DELETE SET NULL would null the children. Children are repointed to the
--     grandparent, so the SET NULL then matches no rows.
--   - Past commissions are not touched (they were computed at the old tier);
--     only future calculations use the new tier.
--   - Recursion is depth-capped (cycle safety); tier_level is clamped at >= 1.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS. Run in SQL Editor.

CREATE OR REPLACE FUNCTION public.promote_orphaned_agencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Promote the entire subtree of the deleted agency's direct children by one tier.
  --    Compute the subtree using the CURRENT parent links (before reattaching).
  WITH RECURSIVE subtree(id, depth) AS (
    SELECT a.id, 1
    FROM public.agencies a
    WHERE a.parent_agency_id = OLD.id
  UNION ALL
    SELECT c.id, s.depth + 1
    FROM public.agencies c
    JOIN subtree s ON c.parent_agency_id = s.id
    WHERE s.depth < 10
  )
  UPDATE public.agencies
  SET tier_level = GREATEST(1, tier_level - 1),
      updated_at = now()
  WHERE id IN (SELECT id FROM subtree);

  -- 2) Reattach the direct children to the grandparent (the deleted agency's parent).
  UPDATE public.agencies
  SET parent_agency_id = OLD.parent_agency_id,
      updated_at = now()
  WHERE parent_agency_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_orphaned_agencies ON public.agencies;
CREATE TRIGGER trg_promote_orphaned_agencies
  BEFORE DELETE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_orphaned_agencies();
