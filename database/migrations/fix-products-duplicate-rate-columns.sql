-- =====================================================
-- products テーブルの重複報酬率カラムを統合
-- commission_rate_tier{N} → tier{N}_commission_rate に統一
-- calculateCommission.js が tier{N}_commission_rate を参照するため
-- =====================================================

-- 1. 旧カラムの値を新カラムに反映（旧カラムに値があり新カラムがデフォルトのままの場合）
UPDATE products SET
  tier1_commission_rate = COALESCE(commission_rate_tier1, tier1_commission_rate),
  tier2_commission_rate = COALESCE(commission_rate_tier2, tier2_commission_rate),
  tier3_commission_rate = COALESCE(commission_rate_tier3, tier3_commission_rate),
  tier4_commission_rate = COALESCE(commission_rate_tier4, tier4_commission_rate)
WHERE commission_rate_tier1 IS NOT NULL
   OR commission_rate_tier2 IS NOT NULL
   OR commission_rate_tier3 IS NOT NULL
   OR commission_rate_tier4 IS NOT NULL;

-- 2. 旧カラムを削除
ALTER TABLE products DROP COLUMN IF EXISTS commission_rate_tier1;
ALTER TABLE products DROP COLUMN IF EXISTS commission_rate_tier2;
ALTER TABLE products DROP COLUMN IF EXISTS commission_rate_tier3;
ALTER TABLE products DROP COLUMN IF EXISTS commission_rate_tier4;
