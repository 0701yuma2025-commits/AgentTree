-- テスト用代理店データ作成SQL（安全版）
-- 既存データがある場合はスキップ

-- Tier1代理店1（縦系列のトップ）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240001',
    '株式会社アルファ商事',
    '法人',
    '山田太郎',
    'yamada@alpha-corp.example.com',
    '03-1111-1111',
    '東京都千代田区大手町1-1-1',
    1,
    NULL,
    'active',
    '1980-01-15',
    jsonb_build_object(
        'bank_name', '三菱UFJ銀行',
        'branch_name', '大手町支店',
        'account_type', '普通',
        'account_number', '1234567',
        'account_holder', 'カ）アルファショウジ'
    ),
    jsonb_build_object(
        'invoice_registered', true,
        'invoice_number', 'T1234567890123',
        'withholding_tax', false
    ),
    NOW() - INTERVAL '1 year'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier2代理店（Tier1-1の配下）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240002',
    '株式会社ベータシステム',
    '法人',
    '鈴木花子',
    'suzuki@beta-sys.example.com',
    '03-2222-2222',
    '東京都港区六本木2-2-2',
    2,
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240001'),
    'active',
    '1985-03-20',
    jsonb_build_object(
        'bank_name', 'みずほ銀行',
        'branch_name', '六本木支店',
        'account_type', '普通',
        'account_number', '2345678',
        'account_holder', 'カ）ベータシステム'
    ),
    jsonb_build_object(
        'invoice_registered', true,
        'invoice_number', 'T2345678901234',
        'withholding_tax', false
    ),
    NOW() - INTERVAL '8 months'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier3代理店（Tier2-1の配下）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240003',
    'ガンマコンサルティング',
    '個人',
    '佐藤次郎',
    'sato@gamma-consul.example.com',
    '03-3333-3333',
    '東京都新宿区西新宿3-3-3',
    3,
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    'active',
    '1990-07-10',
    jsonb_build_object(
        'bank_name', '三井住友銀行',
        'branch_name', '新宿支店',
        'account_type', '普通',
        'account_number', '3456789',
        'account_holder', 'サトウジロウ'
    ),
    jsonb_build_object(
        'invoice_registered', false,
        'invoice_number', null,
        'withholding_tax', true
    ),
    NOW() - INTERVAL '6 months'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier4代理店（Tier3-1の配下）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240004',
    'デルタマーケティング',
    '個人',
    '田中三郎',
    'tanaka@delta-mark.example.com',
    '03-4444-4444',
    '東京都渋谷区渋谷4-4-4',
    4,
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240003'),
    'active',
    '1992-11-25',
    jsonb_build_object(
        'bank_name', 'りそな銀行',
        'branch_name', '渋谷支店',
        'account_type', '普通',
        'account_number', '4567890',
        'account_holder', 'タナカサブロウ'
    ),
    jsonb_build_object(
        'invoice_registered', false,
        'invoice_number', null,
        'withholding_tax', true
    ),
    NOW() - INTERVAL '3 months'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier1代理店2（横展開系列のトップ）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240005',
    '株式会社イプシロン',
    '法人',
    '高橋四郎',
    'takahashi@epsilon.example.com',
    '045-5555-5555',
    '神奈川県横浜市西区みなとみらい5-5-5',
    1,
    NULL,
    'active',
    '1978-05-08',
    jsonb_build_object(
        'bank_name', '横浜銀行',
        'branch_name', 'みなとみらい支店',
        'account_type', '普通',
        'account_number', '5678901',
        'account_holder', 'カ）イプシロン'
    ),
    jsonb_build_object(
        'invoice_registered', true,
        'invoice_number', 'T5678901234567',
        'withholding_tax', false
    ),
    NOW() - INTERVAL '10 months'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier2代理店2（Tier1-2の配下、1つ目）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240006',
    '株式会社ゼータテック',
    '法人',
    '伊藤五郎',
    'ito@zeta-tech.example.com',
    '045-6666-6666',
    '神奈川県横浜市中区山下町6-6-6',
    2,
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240005'),
    'active',
    '1982-09-12',
    jsonb_build_object(
        'bank_name', '神奈川銀行',
        'branch_name', '山下町支店',
        'account_type', '普通',
        'account_number', '6789012',
        'account_holder', 'カ）ゼータテック'
    ),
    jsonb_build_object(
        'invoice_registered', true,
        'invoice_number', 'T6789012345678',
        'withholding_tax', false
    ),
    NOW() - INTERVAL '7 months'
) ON CONFLICT (agency_code) DO NOTHING;

-- Tier2代理店3（Tier1-2の配下、2つ目）
INSERT INTO agencies (
    agency_code,
    company_name,
    company_type,
    representative_name,
    contact_email,
    contact_phone,
    address,
    tier_level,
    parent_agency_id,
    status,
    birth_date,
    bank_account,
    tax_info,
    created_at
) VALUES (
    'AGN20240007',
    'イータソリューションズ',
    '個人',
    '渡辺六子',
    'watanabe@eta-sol.example.com',
    '045-7777-7777',
    '神奈川県川崎市川崎区駅前本町7-7-7',
    2,
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240005'),
    'pending',
    '1988-12-30',
    jsonb_build_object(
        'bank_name', '川崎信用金庫',
        'branch_name', '本店',
        'account_type', '普通',
        'account_number', '7890123',
        'account_holder', 'ワタナベロクコ'
    ),
    jsonb_build_object(
        'invoice_registered', false,
        'invoice_number', null,
        'withholding_tax', true
    ),
    NOW() - INTERVAL '1 month'
) ON CONFLICT (agency_code) DO NOTHING;

-- 既存データ確認
SELECT
    agency_code,
    company_name,
    tier_level,
    status,
    (SELECT company_name FROM agencies p WHERE p.id = a.parent_agency_id) as parent_company
FROM agencies a
ORDER BY agency_code;