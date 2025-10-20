-- 2段階認証（2FA/TOTP）機能追加
-- 既存データを壊さない安全な設計（全カラムNULL許可 or DEFAULT値設定）

-- usersテーブルに2FA関連カラムを追加
ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS backup_codes TEXT[] NULL;

-- コメント追加（ドキュメント化）
COMMENT ON COLUMN users.two_factor_secret IS 'TOTP秘密鍵（暗号化推奨）';
COMMENT ON COLUMN users.two_factor_enabled IS '2FA有効化フラグ';
COMMENT ON COLUMN users.two_factor_verified_at IS '2FA初回検証完了日時';
COMMENT ON COLUMN users.backup_codes IS 'バックアップコード配列（ハッシュ化済み）';

-- インデックス追加（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled
ON users(two_factor_enabled)
WHERE two_factor_enabled = true;

-- マイグレーション確認用ビュー
CREATE OR REPLACE VIEW v_2fa_migration_status AS
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN two_factor_enabled THEN 1 END) as users_with_2fa,
  COUNT(CASE WHEN two_factor_enabled AND two_factor_verified_at IS NOT NULL THEN 1 END) as verified_users,
  ROUND(
    100.0 * COUNT(CASE WHEN two_factor_enabled THEN 1 END) / NULLIF(COUNT(*), 0),
    2
  ) as adoption_rate_percent
FROM users;

-- 実行確認
SELECT * FROM v_2fa_migration_status;
