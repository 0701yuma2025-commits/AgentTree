-- Tier2代理店向けの売上テストデータ作成SQL
-- 既存データがある場合はスキップ

-- ベータシステム（Tier2）の売上データ
INSERT INTO sales (
    sale_number,
    agency_id,
    product_id,
    customer_name,
    customer_email,
    customer_phone,
    sale_date,
    quantity,
    unit_price,
    total_amount,
    status,
    notes,
    created_at
) VALUES
-- 2024年11月の売上
(
    'SL202411001',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '田中商店',
    'tanaka@tanaka-shop.example.com',
    '03-1234-5678',
    '2024-11-05',
    2,
    100000,
    200000,
    'confirmed',
    '初回購入のお客様',
    '2024-11-05 10:00:00+09'
),
(
    'SL202411002',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD002'),
    '山田工業',
    'yamada@yamada-ind.example.com',
    '03-2345-6789',
    '2024-11-10',
    1,
    200000,
    200000,
    'confirmed',
    '定期購入のお客様',
    '2024-11-10 14:00:00+09'
),
(
    'SL202411003',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD003'),
    '鈴木商事',
    'suzuki@suzuki-corp.example.com',
    '03-3456-7890',
    '2024-11-15',
    3,
    50000,
    150000,
    'confirmed',
    'キャンペーン期間中の購入',
    '2024-11-15 11:00:00+09'
),
-- 2024年12月の売上
(
    'SL202412001',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '佐藤製作所',
    'sato@sato-mfg.example.com',
    '03-4567-8901',
    '2024-12-03',
    1,
    100000,
    100000,
    'confirmed',
    '追加注文',
    '2024-12-03 09:00:00+09'
),
(
    'SL202412002',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD002'),
    '高橋産業',
    'takahashi@takahashi-ind.example.com',
    '03-5678-9012',
    '2024-12-08',
    2,
    200000,
    400000,
    'confirmed',
    '年末セール',
    '2024-12-08 15:00:00+09'
),
-- 2025年1月の売上
(
    'SL202501001',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD003'),
    '伊藤商会',
    'ito@ito-trading.example.com',
    '03-6789-0123',
    '2025-01-10',
    4,
    50000,
    200000,
    'confirmed',
    '新年初売り',
    '2025-01-10 10:30:00+09'
),
(
    'SL202501002',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240002'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '渡辺電機',
    'watanabe@watanabe-elec.example.com',
    '03-7890-1234',
    '2025-01-15',
    1,
    100000,
    100000,
    'pending',
    '見積もり中',
    '2025-01-15 13:00:00+09'
)
ON CONFLICT (sale_number) DO NOTHING;

-- ゼータテック（Tier2）の売上データ
INSERT INTO sales (
    sale_number,
    agency_id,
    product_id,
    customer_name,
    customer_email,
    customer_phone,
    sale_date,
    quantity,
    unit_price,
    total_amount,
    status,
    notes,
    created_at
) VALUES
-- 2024年11月の売上
(
    'SL202411004',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '横浜商事',
    'info@yokohama-shoji.example.com',
    '045-1111-2222',
    '2024-11-12',
    1,
    100000,
    100000,
    'confirmed',
    '新規開拓',
    '2024-11-12 11:00:00+09'
),
(
    'SL202411005',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD002'),
    '川崎工業',
    'contact@kawasaki-ind.example.com',
    '044-3333-4444',
    '2024-11-20',
    1,
    200000,
    200000,
    'confirmed',
    'リピート購入',
    '2024-11-20 14:30:00+09'
),
-- 2024年12月の売上
(
    'SL202412003',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD003'),
    '相模原電子',
    'sales@sagamihara-elec.example.com',
    '042-5555-6666',
    '2024-12-05',
    5,
    50000,
    250000,
    'confirmed',
    '年末大口注文',
    '2024-12-05 10:00:00+09'
),
(
    'SL202412004',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '藤沢製造',
    'order@fujisawa-mfg.example.com',
    '0466-7777-8888',
    '2024-12-15',
    2,
    100000,
    200000,
    'confirmed',
    'クリスマスセール',
    '2024-12-15 16:00:00+09'
),
-- 2025年1月の売上
(
    'SL202501003',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD002'),
    '鎌倉商店',
    'shop@kamakura-store.example.com',
    '0467-9999-0000',
    '2025-01-08',
    1,
    200000,
    200000,
    'confirmed',
    '新春セール',
    '2025-01-08 09:30:00+09'
),
(
    'SL202501004',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240006'),
    (SELECT id FROM products WHERE product_code = 'PRD003'),
    '茅ヶ崎サービス',
    'service@chigasaki-sv.example.com',
    '0467-1234-5678',
    '2025-01-18',
    2,
    50000,
    100000,
    'pending',
    '審査中',
    '2025-01-18 15:00:00+09'
)
ON CONFLICT (sale_number) DO NOTHING;

-- イータソリューションズ（Tier2）の売上データ
INSERT INTO sales (
    sale_number,
    agency_id,
    product_id,
    customer_name,
    customer_email,
    customer_phone,
    sale_date,
    quantity,
    unit_price,
    total_amount,
    status,
    notes,
    created_at
) VALUES
-- 2024年12月の売上（新しい代理店なので12月から）
(
    'SL202412005',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240007'),
    (SELECT id FROM products WHERE product_code = 'PRD001'),
    '川崎商会',
    'info@kawasaki-shokai.example.com',
    '044-2222-3333',
    '2024-12-20',
    1,
    100000,
    100000,
    'confirmed',
    '初回取引',
    '2024-12-20 11:00:00+09'
),
-- 2025年1月の売上
(
    'SL202501005',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240007'),
    (SELECT id FROM products WHERE product_code = 'PRD002'),
    '多摩産業',
    'sales@tama-sangyo.example.com',
    '042-4444-5555',
    '2025-01-12',
    1,
    200000,
    200000,
    'confirmed',
    '新規獲得',
    '2025-01-12 13:30:00+09'
),
(
    'SL202501006',
    (SELECT id FROM agencies WHERE agency_code = 'AGN20240007'),
    (SELECT id FROM products WHERE product_code = 'PRD003'),
    '武蔵野電機',
    'order@musashino-denki.example.com',
    '0422-6666-7777',
    '2025-01-19',
    3,
    50000,
    150000,
    'pending',
    '検討中',
    '2025-01-19 10:00:00+09'
)
ON CONFLICT (sale_number) DO NOTHING;

-- 売上データの確認
SELECT
    s.sale_number,
    a.company_name as agency_name,
    a.tier_level,
    p.name as product_name,
    s.customer_name,
    s.sale_date,
    s.quantity,
    s.total_amount,
    s.status
FROM sales s
JOIN agencies a ON s.agency_id = a.id
JOIN products p ON s.product_id = p.id
WHERE a.tier_level = 2
ORDER BY s.sale_date DESC
LIMIT 20;