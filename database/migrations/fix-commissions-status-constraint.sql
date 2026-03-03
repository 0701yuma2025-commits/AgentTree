-- =====================================================
-- commissions.status の CHECK制約を修正
-- コードで使用されている全ステータスを許可する
-- =====================================================

-- 既存の制約を削除
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS chk_commissions_status_valid;

-- コードで使用される全ステータスを含む制約を再作成
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_status_valid
  CHECK (status IN ('pending', 'confirmed', 'approved', 'paid', 'carried_forward', 'cancelled'));
