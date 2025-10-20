-- 代理店テーブルにインボイス登録番号フィールドを追加
-- 実行日: 2025-10-13

-- インボイス登録番号フィールド追加
ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(20);

-- インボイス登録番号のインデックス
CREATE INDEX IF NOT EXISTS idx_agencies_invoice_number ON agencies(invoice_number);

-- コメント追加
COMMENT ON COLUMN agencies.invoice_number IS '適格請求書発行事業者登録番号（Tから始まる13桁）';
