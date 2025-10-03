-- productsテーブルにproduct_codeカラムを追加
-- 商品を一意に識別するためのコード

ALTER TABLE products
ADD COLUMN IF NOT EXISTS product_code VARCHAR(50) UNIQUE;

-- 既存データに仮の商品コードを設定（既存のIDを使用）
UPDATE products
SET product_code = 'PRD-' || LPAD(
  (SELECT COUNT(*) + 1 FROM products p2 WHERE p2.created_at < products.created_at OR (p2.created_at = products.created_at AND p2.id < products.id))::text,
  4, '0'
)
WHERE product_code IS NULL;

-- 簡易版：IDの最初の8文字を使用する方法
-- UPDATE products
-- SET product_code = 'PRD-' || SUBSTRING(id::text, 1, 8)
-- WHERE product_code IS NULL;

-- NOT NULL制約を追加
ALTER TABLE products
ALTER COLUMN product_code SET NOT NULL;

-- インデックスを追加（商品コードでの検索を高速化）
CREATE INDEX IF NOT EXISTS idx_products_product_code
ON products(product_code);

-- コメントを追加
COMMENT ON COLUMN products.product_code IS '商品コード（一意識別子）';