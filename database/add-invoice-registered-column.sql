-- agenciesテーブルにinvoice_registeredカラムを追加
-- このカラムはインボイス登録状態を管理するために使用されます

ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS invoice_registered BOOLEAN DEFAULT FALSE;

-- カラムにコメントを追加
COMMENT ON COLUMN agencies.invoice_registered IS 'インボイス登録済みかどうか';

-- インデックスを追加（インボイス登録済み代理店を素早く検索するため）
CREATE INDEX IF NOT EXISTS idx_agencies_invoice_registered
ON agencies(invoice_registered)
WHERE invoice_registered = TRUE;