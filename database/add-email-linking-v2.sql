-- ============================================================
-- 1代理店1ユーザー方式の実装（修正版）
-- 実行日: 2025-09-19
-- 注意: d@g.coは既存ユーザーのため触らない
-- ============================================================

-- Step 1: agenciesテーブルにemailフィールドを追加（ユニーク制約付き）
ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- Step 2: invitationsテーブルにparent_agency_idフィールドを追加
ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS parent_agency_id UUID REFERENCES agencies(id);

-- Step 3: 既存のagenciesレコードにemailを設定（contact_emailから）
-- ただし、d@g.coは既に使用中なので除外
UPDATE agencies
SET email = contact_email
WHERE email IS NULL
  AND contact_email IS NOT NULL
  AND contact_email != 'd@g.co';

-- Step 4: dogという名前の代理店にd@g.coを設定
UPDATE agencies
SET email = 'd@g.co'
WHERE company_name = 'dog'
  AND email IS NULL;

-- Step 5: 管理者用のテスト代理店を作成
-- 別のメールアドレスを使用
INSERT INTO agencies (
    id,
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    email,
    tier_level,
    parent_agency_id,
    status,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'TEST001',
    'テスト管理代理店',
    '法人',
    'テスト管理者',
    'test-admin@example.com',
    'test-admin@example.com',
    1,  -- tier_levelは1以上
    NULL,
    'active',
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Step 6: インデックスを作成（検索パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_agencies_email ON agencies(email);
CREATE INDEX IF NOT EXISTS idx_invitations_parent_agency_id ON invitations(parent_agency_id);

-- Step 7: 確認用クエリ（実行結果を確認）
SELECT
    company_name,
    email,
    contact_email,
    tier_level,
    status
FROM agencies
ORDER BY tier_level, company_name;

-- ============================================================
-- 実行後の確認事項:
-- 1. agenciesテーブルにemailカラムが追加されたか
-- 2. invitationsテーブルにparent_agency_idカラムが追加されたか
-- 3. dog代理店のemailが'd@g.co'になっているか
-- 4. テスト管理代理店が作成されているか
-- ============================================================