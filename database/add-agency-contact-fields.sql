-- 代理店テーブルに連絡先情報フィールドを追加

-- 郵便番号
ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_agencies_postal_code ON agencies(postal_code);

-- コメントを追加
COMMENT ON COLUMN agencies.postal_code IS '郵便番号（ハイフンあり）';

-- 既存カラムの確認用コメント
COMMENT ON COLUMN agencies.contact_phone IS '連絡先電話番号（請求書・領収書に記載）';
COMMENT ON COLUMN agencies.contact_email IS '連絡先メールアドレス（請求書・領収書に記載）';
COMMENT ON COLUMN agencies.address IS '住所（請求書・領収書に記載）';
