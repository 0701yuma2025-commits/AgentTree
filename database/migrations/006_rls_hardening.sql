-- =====================================================
-- 006_rls_hardening.sql
-- RLS hardening (defense-in-depth) for AgentTree
-- =====================================================
--
-- IMPORTANT SECURITY MODEL NOTE
-- Production connects to Supabase with the service_role key.
-- service_role BYPASSES Row Level Security entirely.
-- Therefore RLS is NOT the primary access control of this system.
-- The source of truth for access control MUST always be the Express layer
-- (route guards / query scoping in the Node backend).
-- This SQL is defense-in-depth only: it is the last line of defense if the
-- service_role key leaks, or if a client hits Supabase via the anon key.
-- Do NOT move authorization logic out of Express on the assumption that RLS
-- covers it. It does not, for service_role traffic.
--
-- This migration is idempotent: it can be re-run safely any number of times.
-- All policies use DROP POLICY IF EXISTS before CREATE POLICY.
-- All functions use CREATE OR REPLACE.
-- All ENABLE ROW LEVEL SECURITY calls are no-ops when already enabled.
--
-- COLUMN REALITY (verified against database/full-setup.sql):
--   payments              : no agency_id, no user_id (created_by -> users). admin-only.
--   payment_records       : has agency_id (-> agencies).
--   notification_history  : has agency_id (nullable, ON DELETE SET NULL).
--   commission_settings   : no agency_id. global config. admin-only.
--   notification_templates: no agency_id. global config. admin-only.
--   sale_change_history   : has sale_id (-> sales.agency_id), changed_by (-> users).
--   notifications         : broadcast table, no agency_id/user_id, has target_roles TEXT[]. admin-only.
--
-- AUTH MAPPING (verified): auth.uid() == users.id == agencies.user_id.
-- Admin check pattern (existing convention): EXISTS over users WHERE role='admin'.
-- =====================================================


-- =====================================================
-- PART A: helper functions
-- =====================================================

-- Returns the set of agency ids that the calling auth user (auth.uid())
-- owns directly, i.e. the agencies whose user_id = auth.uid().
-- Most owners have a single agency row, but this returns a set to be safe.
CREATE OR REPLACE FUNCTION public.current_user_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id FROM public.agencies a WHERE a.user_id = auth.uid();
$$;


-- Returns the given agency id plus ALL of its descendants (children, grandchildren, etc).
-- Walks parent_agency_id downward. AgentTree supports tiers 1..5, so depth is bounded
-- at 5 levels below the root for safety; a hard depth cap also prevents runaway recursion.
-- Cycle protection: PostgreSQL CYCLE clause stops re-visiting an id, so a corrupted
-- parent_agency_id loop cannot cause infinite recursion.
-- SECURITY DEFINER so the recursive walk is not itself filtered by RLS on agencies.
CREATE OR REPLACE FUNCTION public.subordinate_agency_ids(root_agency_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT a.id, 1 AS depth
    FROM public.agencies a
    WHERE a.id = root_agency_id
  UNION ALL
    SELECT c.id, s.depth + 1
    FROM public.agencies c
    JOIN subtree s ON c.parent_agency_id = s.id
    WHERE s.depth < 10
  ) CYCLE id SET is_cycle USING path
  SELECT DISTINCT id FROM subtree;
$$;


-- Convenience set: every agency id in the subtree(s) rooted at the caller's own agency(ies).
-- This is the multi-tier replacement for the old "direct children only" sub-selects.
CREATE OR REPLACE FUNCTION public.my_subordinate_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.current_user_agency_ids() cu(id)
  CROSS JOIN LATERAL public.subordinate_agency_ids(cu.id) AS s(id);
$$;


-- Admin check helper (matches existing audit_logs convention).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  );
$$;


-- =====================================================
-- PART B: enable RLS on the 7 currently-unprotected tables
-- =====================================================
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_change_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- PART C: policies for the 7 newly-protected tables
-- =====================================================

-- payments: no agency_id column. Batch payment runs are admin-only data.
DROP POLICY IF EXISTS payments_select_admin ON payments;
CREATE POLICY payments_select_admin ON payments FOR SELECT
  USING (public.is_admin());

-- payment_records: agency-scoped. Visible to the owning agency and all of its
-- descendants' owner (i.e. an upline owner can see downline records via subtree).
DROP POLICY IF EXISTS payment_records_select_own ON payment_records;
CREATE POLICY payment_records_select_own ON payment_records FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- notification_history: agency-scoped (agency_id is nullable). Rows with a NULL
-- agency_id are NOT exposed to non-admins (only admin can see orphaned/global rows).
DROP POLICY IF EXISTS notification_history_select_own ON notification_history;
CREATE POLICY notification_history_select_own ON notification_history FOR SELECT
  USING (
    public.is_admin()
    OR (
      agency_id IS NOT NULL
      AND agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
    )
  );

-- commission_settings: global operator config. Admin-only.
DROP POLICY IF EXISTS commission_settings_select_admin ON commission_settings;
CREATE POLICY commission_settings_select_admin ON commission_settings FOR SELECT
  USING (public.is_admin());

-- notification_templates: global content templates. Admin-only.
DROP POLICY IF EXISTS notification_templates_select_admin ON notification_templates;
CREATE POLICY notification_templates_select_admin ON notification_templates FOR SELECT
  USING (public.is_admin());

-- sale_change_history: scoped to the owning agency of the referenced sale, plus admin.
DROP POLICY IF EXISTS sale_change_history_select_own ON sale_change_history;
CREATE POLICY sale_change_history_select_own ON sale_change_history FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_change_history.sale_id
        AND s.agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
    )
  );

-- notifications: broadcast table with no agency_id/user_id.
-- It carries target_roles TEXT[]. Safest defense-in-depth default is admin-only SELECT,
-- because matching target_roles to the caller would require trusting role text and
-- the Express layer already decides who sees what. Admin-only here.
-- TODO(review): if anon/authenticated clients ever need to read broadcasts directly
-- (currently they do not; Express serves them), relax to:
--   USING (public.is_admin() OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()
--          AND (notifications.target_roles IS NULL OR u.role = ANY(notifications.target_roles))))
DROP POLICY IF EXISTS notifications_select_admin ON notifications;
CREATE POLICY notifications_select_admin ON notifications FOR SELECT
  USING (public.is_admin());


-- =====================================================
-- PART D: fix document_recipients SELECT loophole
-- =====================================================
-- The existing policy allowed "OR user_id IS NULL", which exposed any row whose
-- user_id was NULL to EVERY authenticated user. Remove that branch: a recipient
-- template is visible only to its owner (or admin for support).
DROP POLICY IF EXISTS document_recipients_select_own ON document_recipients;
CREATE POLICY document_recipients_select_own ON document_recipients FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );


-- =====================================================
-- PART E: upgrade existing agency-scoped SELECT policies
--         from 1-segment (direct children only) to multi-tier (full subtree)
-- =====================================================
-- The original policies scoped to "user_id = auth.uid()" only (own agency), or
-- "parent_agency_id IN (own agencies)" (one level of children). AgentTree is a
-- 1..5 tier tree, so an upline owner should be able to read its entire downline.
-- We replace the SELECT policies with subtree-based scoping via
-- public.my_subordinate_agency_ids(). INSERT/UPDATE/DELETE policies are left as-is
-- (write scope intentionally stays at the Express layer; we do not widen writes).

-- agencies: own + full descendant subtree (replaces own + direct children).
DROP POLICY IF EXISTS agencies_select_own ON agencies;
CREATE POLICY agencies_select_own ON agencies FOR SELECT
  USING (
    public.is_admin()
    OR id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- sales: own + descendants.
DROP POLICY IF EXISTS sales_select_own ON sales;
CREATE POLICY sales_select_own ON sales FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- commissions: own + descendants.
DROP POLICY IF EXISTS commissions_select_own ON commissions;
CREATE POLICY commissions_select_own ON commissions FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- payment_history: own + descendants.
DROP POLICY IF EXISTS payment_history_select_own ON payment_history;
CREATE POLICY payment_history_select_own ON payment_history FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- invitations: invitations issued anywhere within the caller's subtree.
-- inviter_agency_id is the agency that sent the invite.
DROP POLICY IF EXISTS invitations_select_own ON invitations;
CREATE POLICY invitations_select_own ON invitations FOR SELECT
  USING (
    public.is_admin()
    OR inviter_agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- notification_settings: own + descendants.
DROP POLICY IF EXISTS notification_settings_select_own ON notification_settings;
CREATE POLICY notification_settings_select_own ON notification_settings FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- agency_documents: own + descendants.
DROP POLICY IF EXISTS agency_documents_select_own ON agency_documents;
CREATE POLICY agency_documents_select_own ON agency_documents FOR SELECT
  USING (
    public.is_admin()
    OR agency_id IN (SELECT id FROM public.my_subordinate_agency_ids() AS t(id))
  );

-- NOTE on products / campaigns: their existing SELECT policies are
-- "any authenticated user" which is intentional (shared catalog). Left unchanged.
-- NOTE on users: users_select_own / users_update_own stay self-scoped. We do NOT
-- widen them, because exposing downline users' rows (password_hash, 2FA secrets)
-- is undesirable even for defense-in-depth. Left unchanged. TODO(review) confirm
-- whether upline managers need read access to downline user profiles; if so, add a
-- narrow column-safe view rather than widening this table policy.


-- =====================================================
-- DONE
-- =====================================================
SELECT 'rls_hardening applied' AS status;
