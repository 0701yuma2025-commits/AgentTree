-- 既存のproductsテーブルを拡張（Tier別報酬率とカテゴリ追加）

-- categoryカラムを追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Tier別報酬率カラムを追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS tier1_commission_rate DECIMAL(5,2) DEFAULT 10.00 CHECK (tier1_commission_rate >= 0 AND tier1_commission_rate <= 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tier2_commission_rate DECIMAL(5,2) DEFAULT 8.00 CHECK (tier2_commission_rate >= 0 AND tier2_commission_rate <= 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tier3_commission_rate DECIMAL(5,2) DEFAULT 6.00 CHECK (tier3_commission_rate >= 0 AND tier3_commission_rate <= 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tier4_commission_rate DECIMAL(5,2) DEFAULT 4.00 CHECK (tier4_commission_rate >= 0 AND tier4_commission_rate <= 100);

-- 作成者・更新者カラムを追加（auth.usersが存在しない場合はusersテーブルを参照）
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by UUID;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- 更新時のタイムスタンプ自動更新トリガー
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- auth.uid()が使用できる場合のみupdated_byを更新
  BEGIN
    NEW.updated_by = auth.uid();
  EXCEPTION
    WHEN OTHERS THEN
      -- auth.uid()が利用できない場合は何もしない
      NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーが存在する場合は削除してから再作成
DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON products;
CREATE TRIGGER trigger_update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- 商品コード自動採番関数
CREATE OR REPLACE FUNCTION generate_product_code()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_code TEXT;
BEGIN
  -- 既存の最大商品コード番号を取得
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(product_code FROM 4) AS INTEGER)),
    0
  ) + 1 INTO next_number
  FROM products
  WHERE product_code ~ '^PRD[0-9]+$';

  -- PRD + 8桁の連番
  new_code := 'PRD' || LPAD(next_number::TEXT, 8, '0');

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- サンプル商品データ挿入（既存データと重複しない場合のみ）
INSERT INTO products (product_code, name, description, price, category, tier1_commission_rate, tier2_commission_rate, tier3_commission_rate, tier4_commission_rate) VALUES
('PRD00000001', 'ベーシックプラン', '基本的なサービスプラン', 10000.00, 'サービス', 10.00, 8.00, 6.00, 4.00),
('PRD00000002', 'スタンダードプラン', '標準的なサービスプラン', 30000.00, 'サービス', 10.00, 8.00, 6.00, 4.00),
('PRD00000003', 'プレミアムプラン', '高機能サービスプラン', 50000.00, 'サービス', 10.00, 8.00, 6.00, 4.00),
('PRD00000004', 'コンサルティング（1時間）', '専門コンサルティングサービス', 15000.00, 'コンサルティング', 12.00, 10.00, 8.00, 6.00),
('PRD00000005', '追加オプション', '各種追加機能', 5000.00, 'オプション', 8.00, 6.00, 4.00, 2.00)
ON CONFLICT (product_code) DO UPDATE SET
  category = EXCLUDED.category,
  tier1_commission_rate = EXCLUDED.tier1_commission_rate,
  tier2_commission_rate = EXCLUDED.tier2_commission_rate,
  tier3_commission_rate = EXCLUDED.tier3_commission_rate,
  tier4_commission_rate = EXCLUDED.tier4_commission_rate;