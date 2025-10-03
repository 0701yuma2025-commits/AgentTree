-- commissionsテーブルに不足しているカラムを追加

-- 源泉徴収税額
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS withholding_tax DECIMAL(12,2) DEFAULT 0;

-- 繰越理由
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS carry_forward_reason TEXT;

-- sale_idをNULLABLEに変更（月次集計で使うため）
ALTER TABLE commissions ALTER COLUMN sale_id DROP NOT NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_commissions_month ON commissions(month);
CREATE INDEX IF NOT EXISTS idx_commissions_agency_month ON commissions(agency_id, month);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);