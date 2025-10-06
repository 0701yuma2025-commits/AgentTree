-- 代理店コード自動採番機能の追加

-- 代理店コード自動採番関数
CREATE OR REPLACE FUNCTION generate_agency_code()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_code TEXT;
  year_str TEXT;
BEGIN
  -- 現在の年を取得（YYYY形式）
  year_str := TO_CHAR(NOW(), 'YYYY');

  -- 既存の最大代理店番号を取得（今年の分のみ）
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(agency_code FROM 8) AS INTEGER)),
    0
  ) + 1 INTO next_number
  FROM agencies
  WHERE agency_code ~ ('^AGN' || year_str || '[0-9]{4}$');

  -- AGN + 年（4桁）+ 連番（4桁）
  new_code := 'AGN' || year_str || LPAD(next_number::TEXT, 4, '0');

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- 代理店テーブルのagency_codeにデフォルト値を設定するトリガー
CREATE OR REPLACE FUNCTION set_agency_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_code IS NULL OR NEW.agency_code = '' THEN
    NEW.agency_code := generate_agency_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_set_agency_code ON agencies;
CREATE TRIGGER trigger_set_agency_code
  BEFORE INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION set_agency_code();

-- コメント追加
COMMENT ON FUNCTION generate_agency_code() IS '代理店コードを自動採番する関数（AGN + 年4桁 + 連番4桁）';
COMMENT ON FUNCTION set_agency_code() IS '代理店作成時にagency_codeを自動設定するトリガー関数';