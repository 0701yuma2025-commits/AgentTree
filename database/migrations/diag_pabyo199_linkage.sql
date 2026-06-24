-- READ ONLY / pabyo199 の代理店リンク状態を診断
-- ポイント: ログインメール(users.email) と agencies.email が完全一致しているか

-- 1) pabyo199 に該当しそうな代理店レコード（email/会社名/コード/代表者で広く検索）
SELECT id, agency_code, company_name, representative_name,
       email AS agency_email, contact_email,
       tier_level, parent_agency_id, status
FROM agencies
WHERE email ILIKE '%pabyo199%'
   OR contact_email ILIKE '%pabyo199%'
   OR company_name ILIKE '%pabyo199%'
   OR representative_name ILIKE '%pabyo199%'
   OR agency_code ILIKE '%pabyo199%';

-- 2) users 側（ログインアカウント）の該当行
SELECT id, email, role, is_active
FROM users
WHERE email ILIKE '%pabyo199%';

-- 3) agencies.email と users.email が一致しているペアがあるか（=リンク成立条件）
SELECT u.email AS user_email, u.role,
       a.agency_code, a.company_name, a.email AS agency_email,
       a.tier_level, a.parent_agency_id, a.status
FROM users u
JOIN agencies a ON a.email = u.email
WHERE u.email ILIKE '%pabyo199%';

-- 4) もし上で代理店IDが分かったら、その傘下（子）が居るか確認
--    （'ここにpabyo199のagency_id' を 1) で出た id に置き換えて実行）
-- SELECT agency_code, company_name, tier_level, parent_agency_id, status
-- FROM agencies
-- WHERE parent_agency_id = 'ここにpabyo199のagency_id';
