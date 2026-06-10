-- ============================================================
-- 000_verify_project.sql  (READ ONLY / 何も変更しません)
-- 004 を流す前に「このSupabaseがAgentTree本番か」を目視確認する用。
-- Supabase SQL Editor に貼って実行してください。
-- ============================================================

-- 1) AgentTree の主要テーブルが揃っているか（5行返れば正解）
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('agencies', 'products', 'commission_settings', 'campaigns', 'commissions')
ORDER BY table_name;

-- 2) 現在の階層上限（未マイグレーション時は「1 AND 4」が返る）
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.agencies'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%tier_level%';

-- 3) Tier5 列が既にあるか（未適用なら has_tier5_* は false）
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='products' AND column_name='tier5_commission_rate') AS has_tier5_product_rate,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='commission_settings' AND column_name='tier4_from_tier5_bonus') AS has_tier4_from_tier5_bonus;

-- 4) 実データで自社か確認（代理店数・使用中の最大階層・代表的な会社名トップ5）
SELECT COUNT(*) AS agency_count, MAX(tier_level) AS max_tier_in_use
FROM public.agencies;

SELECT agency_code, company_name, tier_level, status
FROM public.agencies
ORDER BY created_at ASC
LIMIT 5;
