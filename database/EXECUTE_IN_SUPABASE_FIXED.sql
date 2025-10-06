-- ============================================================
-- 重要: このSQLはSupabase管理画面のSQL Editorで実行してください
-- 実行日: 2025-09-19
-- 目的: 1代理店1ユーザー方式の実装（修正版）
-- ============================================================

-- Step 1: agenciesテーブルにemailフィールドを追加（ユニーク制約付き）
ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- Step 2: invitationsテーブルにparent_agency_idフィールドを追加
ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS parent_agency_id UUID REFERENCES agencies(id);

-- Step 3: 既存のagenciesレコードにemailを設定（contact_emailから）
UPDATE agencies
SET email = contact_email
WHERE email IS NULL AND contact_email IS NOT NULL;

-- Step 4: 既存のDog代理店にメールアドレスを設定
UPDATE agencies
SET email = 'd@g.com'
WHERE company_name = 'Dog代理店' AND email IS NULL;

-- Step 5: admina用の管理本部代理店を作成（管理者用）
-- 注意: tier_levelは1以上でなければならない（制約あり）
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
    'ADM001',
    '管理本部',
    '法人',
    '管理者',
    'admina@example.com',
    'admina@example.com',
    1,  -- 管理者もtier_level=1（最上位階層）
    NULL,  -- 親代理店なし
    'active',
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE
SET
    company_name = '管理本部',
    tier_level = 1,
    parent_agency_id = NULL;

-- Step 6: インデックスを作成（検索パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_agencies_email ON agencies(email);
CREATE INDEX IF NOT EXISTS idx_invitations_parent_agency_id ON invitations(parent_agency_id);

-- Step 7: 確認用クエリ（実行結果を確認）
SELECT
    company_name,
    email,
    contact_email,
    tier_level,
    parent_agency_id,
    status
FROM agencies
ORDER BY tier_level, company_name;

-- ============================================================
-- 実行後の確認事項:
-- 1. agenciesテーブルにemailカラムが追加されたか
-- 2. invitationsテーブルにparent_agency_idカラムが追加されたか
-- 3. Dog代理店のemailが'd@g.com'になっているか
-- 4. 管理本部のレコードが作成されているか（tier_level=1）
-- ============================================================