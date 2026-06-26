-- 008_invitation_rpcs.sql
-- Recreate the invitation RPCs with HASHED token storage (#10).
--
-- BACKGROUND:
--   invitations.js calls public.create_invitation / validate_invitation /
--   accept_invitation, but these functions did not exist in the database
--   (verified via pg_proc and via PostgREST PGRST202). The whole invitation
--   create/validate/accept flow was therefore non-functional (every call -> 500).
--
-- SECURITY GOAL (#10):
--   invitations.token must NOT store the plaintext token. We store only the
--   sha256 hex digest. The plaintext token is returned to the application once
--   (for the invite URL/email) and never persisted. This matches the existing
--   set-password pattern (Node crypto.createHash('sha256') hex == SQL
--   encode(digest(token,'sha256'),'hex')), so the two hash formats are identical.
--
-- Idempotent: CREATE OR REPLACE for every function; safe to re-run.
--
-- ASSUMPTIONS (documented, not guessed silently):
--   * invitations(token) holds the sha256 hex of the plaintext token.
--   * invited (child) agency tier = parent tier + 1, capped at 5; top-level
--     invite (no parent) starts at tier 1.
--   * accept creates the child agency (invitations.created_agency_id proves this
--     was the intended design) and ensures a public.users mirror row exists, then
--     stamps accepted_at. The auth user itself is created by the route
--     (supabase.auth.signUp) BEFORE accept_invitation is called.
--   * p_password is accepted for call-signature compatibility but unused here
--     (the password is set by the route's signUp, not by this function).

-- pgcrypto provides gen_random_bytes() and digest(). IF NOT EXISTS is a no-op
-- when already installed (Supabase ships it, usually in the extensions schema).
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================
-- create_invitation: generate token, store its hash, return plaintext token
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_agency_id        uuid,
  p_email            text,
  p_created_by       uuid,
  p_parent_agency_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_plain   text;
  v_hash    text;
  v_parent  uuid;
  v_tier    integer;
  v_expires timestamptz;
  v_id      uuid;
BEGIN
  -- Resolve the parent of the invited agency, then its tier (parent tier + 1).
  v_parent := COALESCE(p_parent_agency_id, p_agency_id);
  IF v_parent IS NOT NULL THEN
    SELECT tier_level + 1 INTO v_tier FROM public.agencies WHERE id = v_parent;
  END IF;
  IF v_tier IS NULL THEN
    v_tier := 1;
  END IF;
  IF v_tier > 5 THEN
    RAISE EXCEPTION 'tier limit exceeded: cannot invite below tier 5';
  END IF;

  -- One active (not accepted, not expired) invite per email.
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE email = p_email
      AND accepted_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invitation already exists for this email';
  END IF;

  v_plain   := encode(gen_random_bytes(32), 'hex');
  v_hash    := encode(digest(v_plain, 'sha256'), 'hex');
  v_expires := now() + interval '7 days';

  INSERT INTO public.invitations (
    inviter_agency_id, parent_agency_id, email, token, tier_level, expires_at
  ) VALUES (
    p_agency_id, p_parent_agency_id, p_email, v_hash, v_tier, v_expires
  )
  RETURNING id INTO v_id;

  -- Plaintext token is returned ONLY here; it is never stored.
  RETURN jsonb_build_object(
    'id',               v_id,
    'email',            p_email,
    'token',            v_plain,
    'parent_agency_id', p_parent_agency_id,
    'tier_level',       v_tier,
    'expires_at',       v_expires
  );
END;
$$;


-- =====================================================
-- validate_invitation: hash incoming token, return invite if valid, else NULL
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row  public.invitations%ROWTYPE;
BEGIN
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_row FROM public.invitations
  WHERE token = v_hash
    AND accepted_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',               v_row.id,
    'email',            v_row.email,
    'inviter_agency_id', v_row.inviter_agency_id,
    'parent_agency_id', v_row.parent_agency_id,
    'tier_level',       v_row.tier_level,
    'expires_at',       v_row.expires_at
  );
END;
$$;


-- =====================================================
-- accept_invitation: validate (hashed), create child agency + users mirror,
--                    stamp accepted_at. Single transaction (function body).
-- =====================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token     text,
  p_password  text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash      text;
  v_inv       public.invitations%ROWTYPE;
  v_user_id   uuid;
  v_company   text;
  v_agency_id uuid;
BEGIN
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM public.invitations
  WHERE token = v_hash
    AND accepted_at IS NULL
    AND expires_at > now()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired invitation';
  END IF;

  -- The route's supabase.auth.signUp already created the auth user; link by email.
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_inv.email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth user not found for %', v_inv.email;
  END IF;

  -- Ensure a public.users mirror row exists (same shape as set-password upsert).
  INSERT INTO public.users (id, email, full_name, password_hash, role, is_active, created_at)
  VALUES (v_user_id, v_inv.email, p_full_name, 'managed_by_supabase', 'agency', true, now())
  ON CONFLICT (id) DO NOTHING;

  v_company := COALESCE(NULLIF(btrim(p_full_name), ''), split_part(v_inv.email, '@', 1));

  -- Create the invited (child) agency. agency_code is auto-generated by trigger.
  INSERT INTO public.agencies (
    user_id, parent_agency_id, company_name, representative_name,
    email, contact_email, tier_level, status
  ) VALUES (
    v_user_id, v_inv.parent_agency_id, v_company, p_full_name,
    v_inv.email, v_inv.email, v_inv.tier_level, 'active'
  )
  RETURNING id INTO v_agency_id;

  UPDATE public.invitations
  SET accepted_at = now(), created_agency_id = v_agency_id
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'agency_id', v_agency_id,
    'user_id',   v_user_id,
    'email',     v_inv.email
  );
END;
$$;


SELECT 'invitation rpcs created' AS status;
