-- agenciesテーブルに不足しているカラムを追加

-- 代理店コード
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS agency_code VARCHAR(50) UNIQUE;

-- 会社型（法人/個人）
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS company_type VARCHAR(20) DEFAULT '法人' CHECK (company_type IN ('法人', '個人'));

-- 銀行口座情報
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS bank_account JSONB;

-- 税務情報
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS tax_info JSONB;

-- 生年月日（18歳以上確認用）
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS birth_date DATE;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_agencies_agency_code ON agencies(agency_code);
CREATE INDEX IF NOT EXISTS idx_agencies_company_type ON agencies(company_type);

-- コメント追加
COMMENT ON COLUMN agencies.agency_code IS '代理店コード（AGN20240001形式）';
COMMENT ON COLUMN agencies.company_type IS '会社型（法人/個人）';
COMMENT ON COLUMN agencies.bank_account IS '銀行口座情報JSON';
COMMENT ON COLUMN agencies.tax_info IS '税務情報JSON（インボイス番号、源泉徴収等）';
COMMENT ON COLUMN agencies.birth_date IS '代表者生年月日（18歳以上確認用）';

-- 既存データの代理店コードを生成（必要に応じて実行）
DO $$
DECLARE
    rec RECORD;
    code_counter INTEGER := 1;
    new_code VARCHAR(50);
BEGIN
    FOR rec IN SELECT id FROM agencies WHERE agency_code IS NULL ORDER BY created_at
    LOOP
        new_code := 'AGN2024' || LPAD(code_counter::TEXT, 4, '0');
        UPDATE agencies SET agency_code = new_code WHERE id = rec.id;
        code_counter := code_counter + 1;
    END LOOP;
END $$;