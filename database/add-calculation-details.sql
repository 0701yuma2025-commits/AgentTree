-- commissions テーブルに calculation_details カラムを追加
-- 売上登録時の報酬自動計算で必要（計算内訳をJSONBで保存）
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS calculation_details JSONB DEFAULT '{}'::jsonb;