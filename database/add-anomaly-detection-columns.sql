-- salesテーブルに異常検知用カラムを追加
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS anomaly_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS anomaly_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS anomaly_reasons JSONB,
ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT FALSE;

-- インデックスを追加（異常検知されたレコードを素早く検索するため）
CREATE INDEX IF NOT EXISTS idx_sales_anomaly_detected ON sales(anomaly_detected) WHERE anomaly_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_requires_review ON sales(requires_review) WHERE requires_review = TRUE;

-- コメント追加
COMMENT ON COLUMN sales.anomaly_detected IS '異常が検知されたかどうか';
COMMENT ON COLUMN sales.anomaly_score IS '異常スコア（0-100）';
COMMENT ON COLUMN sales.anomaly_reasons IS '異常検知の理由（JSON形式）';
COMMENT ON COLUMN sales.requires_review IS '管理者のレビューが必要かどうか';