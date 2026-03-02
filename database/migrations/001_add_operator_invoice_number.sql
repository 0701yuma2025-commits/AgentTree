-- 運営側インボイス登録番号カラム追加
-- commission_settings テーブルに operator_invoice_number を追加
ALTER TABLE commission_settings
ADD COLUMN IF NOT EXISTS operator_invoice_number VARCHAR(14) DEFAULT NULL;

COMMENT ON COLUMN commission_settings.operator_invoice_number
IS '運営側の適格請求書発行事業者登録番号（T + 13桁）';
