-- ============================================================
-- 004_add_tier5_support.sql
-- Add 5th tier (Tier5) support across the schema.
-- Run this on Supabase BEFORE deploying the matching code.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1) agencies.tier_level: allow 1..5 (was 1..4)
--    Drop any existing CHECK constraint that references tier_level,
--    then add the new 1..5 constraint. This is robust to the old
--    constraint having an auto-generated name.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.agencies'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tier_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.agencies DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_tier_level_check CHECK (tier_level BETWEEN 1 AND 5);

-- 2) products: add Tier5 commission rate column (default 2.00%)
--    ADD COLUMN ... DEFAULT backfills existing rows with 2.00.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tier5_commission_rate DECIMAL(5,2) DEFAULT 2.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'chk_products_tier5_rate_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_tier5_rate_range
      CHECK (tier5_commission_rate >= 0 AND tier5_commission_rate <= 100);
  END IF;
END $$;

-- 3) commission_settings: add Tier4<-Tier5 hierarchy bonus (default 0.50%)
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS tier4_from_tier5_bonus DECIMAL(5,2) DEFAULT 0.50;

-- 4) campaigns: default target tiers now include Tier5
ALTER TABLE public.campaigns
  ALTER COLUMN target_tier_levels SET DEFAULT ARRAY[1,2,3,4,5];

-- ============================================================
-- Verification (optional, read-only):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'agencies_tier_level_check';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='products' AND column_name='tier5_commission_rate';
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='commission_settings' AND column_name='tier4_from_tier5_bonus';
-- ============================================================
