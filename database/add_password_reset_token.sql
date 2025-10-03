-- agenciesテーブルにパスワードリセット用のカラムを追加
-- 作成日: 2025-10-02
-- 目的: パスワード設定機能のサポート

ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMPTZ;

-- インデックスを追加（検索高速化）
CREATE INDEX IF NOT EXISTS idx_agencies_password_reset_token
ON agencies(password_reset_token)
WHERE password_reset_token IS NOT NULL;

-- コメント追加
COMMENT ON COLUMN agencies.password_reset_token IS 'パスワードリセット用のトークン';
COMMENT ON COLUMN agencies.password_reset_expiry IS 'トークンの有効期限';
