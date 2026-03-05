-- 違反回数カラム追加 & terminatedステータス対応
-- 2026-03-05

-- 違反回数カラム追加
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0;

-- ステータス制約を更新（terminated追加）
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS chk_agencies_status_valid;
ALTER TABLE agencies ADD CONSTRAINT chk_agencies_status_valid
  CHECK (status IN ('pending', 'active', 'suspended', 'terminated'));
