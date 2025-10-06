-- 既存のパスワードリセットトークンをクリア
-- 作成日: 2025-10-02
-- 目的: テスト中に重複したトークンをクリア

UPDATE agencies
SET password_reset_token = NULL,
    password_reset_expiry = NULL;
