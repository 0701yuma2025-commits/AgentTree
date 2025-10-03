-- 代理店テーブルに銀行口座・税務情報フィールドを追加

-- 会社種別（法人/個人）フィールドを追加
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS company_type VARCHAR(20) DEFAULT '法人' CHECK (company_type IN ('法人', '個人'));

-- 銀行口座情報をJSON形式で保存
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS bank_account JSONB;

-- 税務情報をJSON形式で保存
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS tax_info JSONB;

-- 代表者電話番号
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS representative_phone VARCHAR(20);

-- 代表者メールアドレス
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS representative_email VARCHAR(255);

-- 生年月日（18歳以上確認用）
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS birth_date DATE;

-- インボイス登録番号
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);

-- 源泉徴収対象フラグ
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS withholding_tax_flag BOOLEAN DEFAULT false;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_agencies_company_type ON agencies(company_type);
CREATE INDEX IF NOT EXISTS idx_agencies_invoice_number ON agencies(invoice_number);

-- コメント追加
COMMENT ON COLUMN agencies.company_type IS '会社種別（法人/個人）';
COMMENT ON COLUMN agencies.bank_account IS '銀行口座情報 JSON形式 {bank_name, branch_name, account_type, account_number, account_holder}';
COMMENT ON COLUMN agencies.tax_info IS '税務情報 JSON形式 {tax_id, tax_office, tax_classification}';
COMMENT ON COLUMN agencies.representative_phone IS '代表者電話番号';
COMMENT ON COLUMN agencies.representative_email IS '代表者メールアドレス';
COMMENT ON COLUMN agencies.birth_date IS '代表者生年月日（18歳以上確認用）';
COMMENT ON COLUMN agencies.invoice_number IS 'インボイス登録番号';
COMMENT ON COLUMN agencies.withholding_tax_flag IS '源泉徴収対象フラグ（個人事業主の場合true）';

-- 銀行口座情報のサンプル構造
/*
bank_account = {
  "bank_name": "三菱UFJ銀行",
  "branch_name": "新宿支店",
  "account_type": "普通",
  "account_number": "1234567",
  "account_holder": "カブシキガイシャ エービーシー",
  "swift_code": "BOTKJPJT"  -- 国際送金用（オプション）
}
*/

-- 税務情報のサンプル構造
/*
tax_info = {
  "tax_id": "1234567890123",  -- 法人番号
  "tax_office": "新宿税務署",
  "tax_classification": "普通法人",
  "fiscal_year_end": "03-31",  -- 決算月日
  "capital": 10000000,  -- 資本金
  "invoice_registered": true  -- インボイス制度登録済み
}
*/

-- 会社種別に基づく源泉徴収フラグの自動更新トリガー
CREATE OR REPLACE FUNCTION update_withholding_tax_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- 個人の場合は源泉徴収対象
  IF NEW.company_type = '個人' THEN
    NEW.withholding_tax_flag := true;
  ELSE
    NEW.withholding_tax_flag := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_update_withholding_tax ON agencies;
CREATE TRIGGER trigger_update_withholding_tax
  BEFORE INSERT OR UPDATE OF company_type ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_withholding_tax_flag();

-- 18歳以上確認の制約を追加（生年月日が入力された場合のみチェック）
ALTER TABLE agencies ADD CONSTRAINT check_adult_age
  CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE - INTERVAL '18 years');

-- バリデーション関数：銀行口座情報の検証
CREATE OR REPLACE FUNCTION validate_bank_account(bank_data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- 必須フィールドの確認
  IF bank_data IS NULL THEN
    RETURN true;  -- NULL許可
  END IF;

  IF NOT (bank_data ? 'bank_name' AND
          bank_data ? 'branch_name' AND
          bank_data ? 'account_type' AND
          bank_data ? 'account_number' AND
          bank_data ? 'account_holder') THEN
    RETURN false;
  END IF;

  -- 口座種別のチェック
  IF bank_data->>'account_type' NOT IN ('普通', '当座', '貯蓄') THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- 銀行口座情報のバリデーション制約
ALTER TABLE agencies ADD CONSTRAINT check_valid_bank_account
  CHECK (validate_bank_account(bank_account));