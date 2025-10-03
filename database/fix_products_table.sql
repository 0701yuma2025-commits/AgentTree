-- productsテーブルが既に存在する場合は削除して再作成
DROP TABLE IF EXISTS products CASCADE;

-- 商品マスタテーブル作成（修正版）
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,  -- product_name → name に変更
    price DECIMAL(15, 2) NOT NULL,
    commission_rate_tier1 DECIMAL(5, 2) DEFAULT 10.00,
    commission_rate_tier2 DECIMAL(5, 2) DEFAULT 8.00,
    commission_rate_tier3 DECIMAL(5, 2) DEFAULT 6.00,
    commission_rate_tier4 DECIMAL(5, 2) DEFAULT 4.00,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX idx_products_product_code ON products(product_code);
CREATE INDEX idx_products_is_active ON products(is_active);

-- サンプルデータ挿入
INSERT INTO products (product_code, name, price, description) VALUES
    ('PRD001', '商品A', 100000, 'スタンダードプラン'),
    ('PRD002', '商品B', 200000, 'プレミアムプラン'),
    ('PRD003', '商品C', 50000, 'エントリープラン')
ON CONFLICT (product_code) DO NOTHING;

-- コメント追加
COMMENT ON TABLE products IS '商品マスタテーブル';
COMMENT ON COLUMN products.product_code IS '商品コード（ユニーク）';
COMMENT ON COLUMN products.name IS '商品名';
COMMENT ON COLUMN products.price IS '標準価格';
COMMENT ON COLUMN products.commission_rate_tier1 IS 'Tier1代理店の報酬率(%)';
COMMENT ON COLUMN products.commission_rate_tier2 IS 'Tier2代理店の報酬率(%)';
COMMENT ON COLUMN products.commission_rate_tier3 IS 'Tier3代理店の報酬率(%)';
COMMENT ON COLUMN products.commission_rate_tier4 IS 'Tier4代理店の報酬率(%)';
COMMENT ON COLUMN products.description IS '商品説明';
COMMENT ON COLUMN products.is_active IS 'アクティブフラグ';