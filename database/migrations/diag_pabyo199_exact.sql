-- READ ONLY / pabyo199@ichigo.me の紐付けを正確に確認

-- 1) この代理店の email / contact_email の実値（不一致や別カラム格納を見抜く）
SELECT id, agency_code, company_name,
       email AS agency_email, contact_email,
       tier_level, parent_agency_id, status
FROM agencies
WHERE email = 'pabyo199@ichigo.me'
   OR contact_email = 'pabyo199@ichigo.me';

-- 2) リンク成立条件（middlewareは agencies.email = users.email で一致を見る）
--    この行が「出る」=リンクOK / 「出ない」=ここが原因
SELECT u.email AS user_email, u.role, u.is_active,
       a.id AS agency_id, a.agency_code, a.email AS agency_email, a.status
FROM users u
JOIN agencies a ON a.email = u.email
WHERE u.email = 'pabyo199@ichigo.me';

-- 3) pabyo199 の傘下（子代理店）が存在するか
SELECT child.agency_code, child.company_name, child.tier_level, child.status
FROM agencies child
JOIN agencies parent ON child.parent_agency_id = parent.id
WHERE parent.email = 'pabyo199@ichigo.me'
   OR parent.contact_email = 'pabyo199@ichigo.me';
