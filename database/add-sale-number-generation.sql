-- 売上番号自動採番機能の追加

-- 売上番号自動採番関数
CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_number TEXT;
  year_month TEXT;
BEGIN
  -- 現在の年月を取得（YYYYMM形式）
  year_month := TO_CHAR(NOW(), 'YYYYMM');

  -- 既存の最大売上番号を取得（今月の分のみ）
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(sale_number FROM 10) AS INTEGER)),
    0
  ) + 1 INTO next_number
  FROM sales
  WHERE sale_number ~ ('^SL' || year_month || '-[0-9]{5}$');

  -- SL + 年月（6桁）+ ハイフン + 連番（5桁）
  new_number := 'SL' || year_month || '-' || LPAD(next_number::TEXT, 5, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 売上テーブルのsale_numberにデフォルト値を設定するトリガー
CREATE OR REPLACE FUNCTION set_sale_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sale_number IS NULL OR NEW.sale_number = '' THEN
    NEW.sale_number := generate_sale_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_set_sale_number ON sales;
CREATE TRIGGER trigger_set_sale_number
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION set_sale_number();

-- 売上番号のユニークインデックスを確認（既存の場合はスキップ）
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sale_number ON sales(sale_number);

-- コメント追加
COMMENT ON FUNCTION generate_sale_number() IS '売上番号を自動採番する関数（SL + 年月6桁 + ハイフン + 連番5桁）';
COMMENT ON FUNCTION set_sale_number() IS '売上作成時にsale_numberを自動設定するトリガー関数';

-- 売上番号のフォーマット例
/*
  2024年1月の場合:
  - SL202401-00001
  - SL202401-00002
  - SL202401-00003
  ...

  2024年2月の場合:
  - SL202402-00001
  - SL202402-00002
  ...
*/

-- テスト用：売上番号生成関数の動作確認クエリ
/*
SELECT generate_sale_number() AS new_sale_number;
*/