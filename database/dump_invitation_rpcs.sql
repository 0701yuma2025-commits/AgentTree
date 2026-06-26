-- dump_invitation_rpcs.sql
-- PURPOSE: Dump the current source of the invitation RPCs so that #10
--          (invitation token hashing) can be implemented without guessing
--          the function bodies. These functions live in the database, not
--          in the repository.
--
-- HOW TO USE:
--   1. Open Supabase Dashboard -> SQL Editor.
--   2. Run the query below.
--   3. Copy the full output (proname + definition) and hand it to the
--      engineer implementing #10.
--
-- This is a read-only introspection query. It changes nothing.

SELECT
  p.proname,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_invitation', 'validate_invitation', 'accept_invitation')
ORDER BY p.proname;
