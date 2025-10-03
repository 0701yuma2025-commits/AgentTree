-- 初期データ投入

-- 管理者ユーザー作成
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@example.com', '$2b$10$YourHashedPasswordHere', 'System Admin', 'admin');

-- 商品サンプルデータ
INSERT INTO products (product_code, name, description, price, commission_rate) VALUES
('PRD001', 'ベーシックプラン', 'スタンダードなサービスプラン', 10000.00, 10.00),
('PRD002', 'プレミアムプラン', '高機能サービスプラン', 30000.00, 12.00),
('PRD003', 'エンタープライズプラン', '企業向け総合プラン', 100000.00, 15.00);

-- キャンペーンサンプルデータ
INSERT INTO campaigns (name, description, start_date, end_date, bonus_rate, target_tier_levels) VALUES
('新規開拓キャンペーン', '新規顧客獲得で追加ボーナス', '2025-01-01', '2025-03-31', 5.00, ARRAY[1,2,3,4]),
('年度末特別キャンペーン', '年度末限定の特別ボーナス', '2025-03-01', '2025-03-31', 10.00, ARRAY[1,2]);