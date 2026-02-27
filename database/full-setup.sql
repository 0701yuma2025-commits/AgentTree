-- =====================================================
-- 完全セットアップSQL（新規プロジェクト用）
-- 全テーブル + マイグレーション + セキュリティを統合
-- Supabase SQL Editor で実行してください
-- =====================================================

-- ===== PART 1: コアテーブル =====

-- 更新日時自動更新トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  two_factor_secret VARCHAR(255) NULL,
  two_factor_enabled BOOLEAN DEFAULT false NOT NULL,
  two_factor_verified_at TIMESTAMP WITH TIME ZONE NULL,
  backup_codes TEXT[] NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 代理店テーブル（全カラム統合）
CREATE TABLE IF NOT EXISTS agencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  agency_code VARCHAR(50) UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  company_type VARCHAR(20) DEFAULT '法人' CHECK (company_type IN ('法人', '個人')),
  representative_name VARCHAR(255),
  representative_phone VARCHAR(20),
  representative_email VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  email VARCHAR(255) UNIQUE,
  address TEXT,
  postal_code VARCHAR(10),
  tier_level INTEGER NOT NULL CHECK (tier_level BETWEEN 1 AND 4),
  status VARCHAR(50) DEFAULT 'pending',
  commission_rate DECIMAL(5,2),
  bank_account JSONB,
  tax_info JSONB,
  birth_date DATE,
  invoice_number VARCHAR(50),
  invoice_registered BOOLEAN DEFAULT FALSE,
  withholding_tax_flag BOOLEAN DEFAULT false,
  password_reset_token TEXT,
  password_reset_expiry TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 代理店インデックス
CREATE INDEX IF NOT EXISTS idx_agencies_parent_id ON agencies(parent_agency_id);
CREATE INDEX IF NOT EXISTS idx_agencies_tier_level ON agencies(tier_level);
CREATE INDEX IF NOT EXISTS idx_agencies_status ON agencies(status);
CREATE INDEX IF NOT EXISTS idx_agencies_agency_code ON agencies(agency_code);
CREATE INDEX IF NOT EXISTS idx_agencies_company_type ON agencies(company_type);
CREATE INDEX IF NOT EXISTS idx_agencies_email ON agencies(email);
CREATE INDEX IF NOT EXISTS idx_agencies_invoice_number ON agencies(invoice_number);
CREATE INDEX IF NOT EXISTS idx_agencies_invoice_registered ON agencies(invoice_registered) WHERE invoice_registered = TRUE;
CREATE INDEX IF NOT EXISTS idx_agencies_postal_code ON agencies(postal_code);
CREATE INDEX IF NOT EXISTS idx_agencies_password_reset_token ON agencies(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- 18歳以上確認の制約
ALTER TABLE agencies ADD CONSTRAINT check_adult_age
  CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE - INTERVAL '18 years');

-- 銀行口座バリデーション関数
CREATE OR REPLACE FUNCTION validate_bank_account(bank_data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  IF bank_data IS NULL THEN RETURN true; END IF;
  IF NOT (bank_data ? 'bank_name' AND bank_data ? 'branch_name' AND
          bank_data ? 'account_type' AND bank_data ? 'account_number' AND
          bank_data ? 'account_holder') THEN
    RETURN false;
  END IF;
  IF bank_data->>'account_type' NOT IN ('普通', '当座', '貯蓄') THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE agencies ADD CONSTRAINT check_valid_bank_account
  CHECK (validate_bank_account(bank_account));

-- 源泉徴収フラグ自動更新トリガー
CREATE OR REPLACE FUNCTION update_withholding_tax_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_type = '個人' THEN
    NEW.withholding_tax_flag := true;
  ELSE
    NEW.withholding_tax_flag := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_withholding_tax
  BEFORE INSERT OR UPDATE OF company_type ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_withholding_tax_flag();

-- 代理店コード自動採番
CREATE OR REPLACE FUNCTION generate_agency_code()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_code TEXT;
  year_str TEXT;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(agency_code FROM 8) AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM agencies
  WHERE agency_code ~ ('^AGN' || year_str || '[0-9]{4}$');
  new_code := 'AGN' || year_str || LPAD(next_number::TEXT, 4, '0');
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_agency_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_code IS NULL OR NEW.agency_code = '' THEN
    NEW.agency_code := generate_agency_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_agency_code
  BEFORE INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION set_agency_code();

-- 商品テーブル（統合版）
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(15,2) NOT NULL,
  category VARCHAR(100),
  commission_rate DECIMAL(5,2),
  commission_rate_tier1 DECIMAL(5,2) DEFAULT 10.00,
  commission_rate_tier2 DECIMAL(5,2) DEFAULT 8.00,
  commission_rate_tier3 DECIMAL(5,2) DEFAULT 6.00,
  commission_rate_tier4 DECIMAL(5,2) DEFAULT 4.00,
  tier1_commission_rate DECIMAL(5,2) DEFAULT 10.00 CHECK (tier1_commission_rate >= 0 AND tier1_commission_rate <= 100),
  tier2_commission_rate DECIMAL(5,2) DEFAULT 8.00 CHECK (tier2_commission_rate >= 0 AND tier2_commission_rate <= 100),
  tier3_commission_rate DECIMAL(5,2) DEFAULT 6.00 CHECK (tier3_commission_rate >= 0 AND tier3_commission_rate <= 100),
  tier4_commission_rate DECIMAL(5,2) DEFAULT 4.00 CHECK (tier4_commission_rate >= 0 AND tier4_commission_rate <= 100),
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 商品コード自動採番
CREATE OR REPLACE FUNCTION generate_product_code()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_code TEXT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(product_code FROM 4) AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM products
  WHERE product_code ~ '^PRD[0-9]+$';
  new_code := 'PRD' || LPAD(next_number::TEXT, 8, '0');
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- キャンペーンテーブル
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  bonus_rate DECIMAL(5,2),
  bonus_amount DECIMAL(12,2),
  target_tier_levels INTEGER[] DEFAULT ARRAY[1,2,3,4],
  conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 売上テーブル（統合版）
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_number VARCHAR(50) UNIQUE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  sale_date DATE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  anomaly_detected BOOLEAN DEFAULT FALSE,
  anomaly_score NUMERIC DEFAULT 0,
  anomaly_reasons JSONB,
  requires_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_agency_id ON sales(agency_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_anomaly_detected ON sales(anomaly_detected) WHERE anomaly_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_requires_review ON sales(requires_review) WHERE requires_review = TRUE;

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 売上番号自動採番
CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  new_number TEXT;
  year_month TEXT;
BEGIN
  year_month := TO_CHAR(NOW(), 'YYYYMM');
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(sale_number FROM 10) AS INTEGER)), 0
  ) + 1 INTO next_number
  FROM sales
  WHERE sale_number ~ ('^SL' || year_month || '-[0-9]{5}$');
  new_number := 'SL' || year_month || '-' || LPAD(next_number::TEXT, 5, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_sale_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sale_number IS NULL OR NEW.sale_number = '' THEN
    NEW.sale_number := generate_sale_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_sale_number
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION set_sale_number();

-- 報酬テーブル（統合版）
CREATE TABLE IF NOT EXISTS commissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  tier_level INTEGER NOT NULL,
  base_amount DECIMAL(12,2) NOT NULL,
  tier_bonus DECIMAL(12,2) DEFAULT 0,
  campaign_bonus DECIMAL(12,2) DEFAULT 0,
  final_amount DECIMAL(12,2) NOT NULL,
  withholding_tax DECIMAL(12,2) DEFAULT 0,
  carry_forward_reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  payment_date DATE,
  month VARCHAR(7),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_agency_id ON commissions(agency_id);
CREATE INDEX IF NOT EXISTS idx_commissions_month ON commissions(month);
CREATE INDEX IF NOT EXISTS idx_commissions_agency_month ON commissions(agency_id, month);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_campaign_id ON commissions(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_campaign_bonus ON commissions(campaign_bonus) WHERE campaign_bonus > 0;

CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON commissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 招待テーブル
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  parent_agency_id UUID REFERENCES agencies(id),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  tier_level INTEGER NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_parent_agency_id ON invitations(parent_agency_id);

-- 支払い履歴テーブル
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50),
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 報酬設定マスタテーブル
CREATE TABLE IF NOT EXISTS commission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minimum_payment_amount DECIMAL(15,2) DEFAULT 10000.00,
  payment_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (payment_cycle IN ('monthly', 'weekly', 'biweekly')),
  payment_day INTEGER DEFAULT 25 CHECK (payment_day >= 1 AND payment_day <= 31),
  tier1_from_tier2_bonus DECIMAL(5,2) DEFAULT 2.00,
  tier2_from_tier3_bonus DECIMAL(5,2) DEFAULT 1.50,
  tier3_from_tier4_bonus DECIMAL(5,2) DEFAULT 1.00,
  closing_day INTEGER DEFAULT 31 CHECK (closing_day >= 1 AND closing_day <= 31),
  withholding_tax_rate DECIMAL(5,2) DEFAULT 10.21,
  non_invoice_deduction_rate DECIMAL(5,2) DEFAULT 2.00,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_commission_settings_active ON commission_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_commission_settings_valid_dates ON commission_settings(valid_from, valid_to);

-- デフォルト報酬設定挿入
INSERT INTO commission_settings (
  minimum_payment_amount, payment_cycle, payment_day, closing_day, is_active
) VALUES (10000.00, 'monthly', 25, 31, true)
ON CONFLICT DO NOTHING;

-- ===== PART 2: 追加テーブル =====

-- 書類管理テーブル
CREATE TABLE IF NOT EXISTS agency_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_documents_agency_id ON agency_documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_documents_status ON agency_documents(status);
CREATE INDEX IF NOT EXISTS idx_agency_documents_type ON agency_documents(document_type);

-- 通知設定テーブル
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  new_sale_notification BOOLEAN DEFAULT true,
  commission_confirmed BOOLEAN DEFAULT true,
  invitation_accepted BOOLEAN DEFAULT true,
  monthly_report BOOLEAN DEFAULT true,
  system_announcement BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  notification_frequency VARCHAR(20) DEFAULT 'realtime' CHECK (notification_frequency IN ('realtime', 'daily', 'weekly', 'monthly')),
  notification_time TIME DEFAULT '09:00:00',
  notification_day_of_week INTEGER DEFAULT 1 CHECK (notification_day_of_week BETWEEN 1 AND 7),
  notification_day_of_month INTEGER DEFAULT 1 CHECK (notification_day_of_month BETWEEN 1 AND 31),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_agency ON notification_settings(agency_id);

-- 通知履歴テーブル
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  notification_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  sent_to VARCHAR(255),
  sent_method VARCHAR(20) CHECK (sent_method IN ('email', 'in_app', 'both')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  error_message TEXT,
  read_at TIMESTAMP WITH TIME ZONE,
  related_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_agency ON notification_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON notification_history(status);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);

-- 通知テンプレートテーブル
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  body_text_template TEXT,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON notification_templates(template_code);

-- デフォルト通知テンプレート
INSERT INTO notification_templates (template_code, template_name, subject_template, body_template, variables) VALUES
('welcome_agency', '代理店登録完了', '代理店登録完了のお知らせ',
 '<h2>{{company_name}} 様</h2><p>代理店登録が完了しました。代理店コード: {{agency_code}}</p>',
 '{"company_name": "会社名", "agency_code": "代理店コード"}'::jsonb),
('new_sale', '新規売上通知', '新規売上登録 [売上番号: {{sale_number}}]',
 '<p>新規売上が登録されました。</p><p>売上番号: {{sale_number}}<br>金額: ¥{{sale_amount}}</p>',
 '{"sale_number": "売上番号", "sale_amount": "売上金額"}'::jsonb),
('commission_confirmed', '報酬確定通知', '{{month}} 報酬確定のお知らせ',
 '<p>{{month}}の報酬が確定しました。</p><p>報酬額: ¥{{commission_amount}}</p>',
 '{"month": "対象月", "commission_amount": "報酬額"}'::jsonb),
('invitation_sent', '招待メール', '代理店登録のご招待',
 '<p>{{parent_agency_name}} から招待が届いています。</p><p>招待コード: {{invitation_code}}</p>',
 '{"parent_agency_name": "親代理店名", "invitation_code": "招待コード"}'::jsonb)
ON CONFLICT (template_code) DO NOTHING;

-- 通知設定自動作成トリガー
CREATE OR REPLACE FUNCTION create_default_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_settings (agency_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_notification_settings
  AFTER INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_settings();

-- 売上変更履歴テーブル
CREATE TABLE IF NOT EXISTS sale_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_change_history_sale_id ON sale_change_history(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_change_history_changed_at ON sale_change_history(changed_at DESC);

-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  description TEXT,
  changes JSONB,
  metadata JSONB,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- 書類宛先テンプレートテーブル
CREATE TABLE IF NOT EXISTS document_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  company_name VARCHAR(255),
  postal_code VARCHAR(20),
  address TEXT,
  contact_person VARCHAR(255),
  department VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  notes TEXT,
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_recipients_user_id ON document_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_document_recipients_type ON document_recipients(recipient_type);
CREATE INDEX IF NOT EXISTS idx_document_recipients_favorite ON document_recipients(is_favorite);
CREATE INDEX IF NOT EXISTS idx_document_recipients_last_used ON document_recipients(last_used_at DESC);

-- 支払いテーブル（一括支払い管理）
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_number VARCHAR(50) UNIQUE,
  payment_date DATE NOT NULL,
  month VARCHAR(7),
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(month);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 支払い明細レコードテーブル
CREATE TABLE IF NOT EXISTS payment_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  month VARCHAR(7),
  payment_date DATE,
  status VARCHAR(50) DEFAULT 'completed',
  commission_count INTEGER DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_agency_id ON payment_records(agency_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_month ON payment_records(month);

-- システム通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  data JSONB,
  priority VARCHAR(20) DEFAULT 'normal',
  target_roles TEXT[],
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;

-- ===== PART 3: データ整合性制約 =====

ALTER TABLE sales ADD CONSTRAINT chk_sales_quantity_positive CHECK (quantity > 0);
ALTER TABLE sales ADD CONSTRAINT chk_sales_unit_price_positive CHECK (unit_price >= 0);
ALTER TABLE sales ADD CONSTRAINT chk_sales_total_amount_positive CHECK (total_amount >= 0);
ALTER TABLE sales ADD CONSTRAINT chk_sales_status_valid CHECK (status IN ('pending', 'confirmed', 'cancelled'));

ALTER TABLE commissions ADD CONSTRAINT chk_commissions_base_amount_positive CHECK (base_amount >= 0);
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_final_amount_positive CHECK (final_amount >= 0);
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_tier_bonus_positive CHECK (tier_bonus >= 0);
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_campaign_bonus_positive CHECK (campaign_bonus >= 0);
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_withholding_tax_positive CHECK (withholding_tax >= 0);
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_status_valid CHECK (status IN ('pending', 'approved', 'paid'));
ALTER TABLE commissions ADD CONSTRAINT chk_commissions_month_format CHECK (month IS NULL OR month ~ '^\d{4}-(0[1-9]|1[0-2])$');

ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_date_range CHECK (start_date <= end_date);
ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_bonus_rate_range CHECK (bonus_rate IS NULL OR (bonus_rate >= 0 AND bonus_rate <= 100));
ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_bonus_amount_positive CHECK (bonus_amount IS NULL OR bonus_amount >= 0);

ALTER TABLE products ADD CONSTRAINT chk_products_price_positive CHECK (price >= 0);
ALTER TABLE products ADD CONSTRAINT chk_products_commission_rate_range CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));

ALTER TABLE payment_history ADD CONSTRAINT chk_payment_history_amount_positive CHECK (amount > 0);

ALTER TABLE agencies ADD CONSTRAINT chk_agencies_status_valid CHECK (status IN ('pending', 'active', 'suspended'));
ALTER TABLE agencies ADD CONSTRAINT chk_agencies_commission_rate_range CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100));

-- 複合インデックス
CREATE INDEX IF NOT EXISTS idx_sales_agency_date ON sales(agency_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_agency_status_month ON commissions(agency_id, status, month);
CREATE INDEX IF NOT EXISTS idx_payment_history_agency_date ON payment_history(agency_id, payment_date DESC);

-- ===== PART 4: RLSポリシー =====

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_own ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update_own ON users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY agencies_select_own ON agencies FOR SELECT
  USING (user_id = auth.uid() OR parent_agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
CREATE POLICY agencies_update_own ON agencies FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_select_own ON sales FOR SELECT
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
CREATE POLICY sales_insert_own ON sales FOR INSERT
  WITH CHECK (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
CREATE POLICY sales_update_own ON sales FOR UPDATE
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY commissions_select_own ON commissions FOR SELECT
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_history_select_own ON payment_history FOR SELECT
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_select_own ON invitations FOR SELECT
  USING (inviter_agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_select_all ON products FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_select_all ON campaigns FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_settings_select_own ON notification_settings FOR SELECT
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));
CREATE POLICY notification_settings_update_own ON notification_settings FOR UPDATE
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE agency_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_documents_select_own ON agency_documents FOR SELECT
  USING (agency_id IN (SELECT id FROM agencies WHERE user_id = auth.uid()));

ALTER TABLE document_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_recipients_select_own ON document_recipients FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY document_recipients_insert_own ON document_recipients FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY document_recipients_update_own ON document_recipients FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY document_recipients_delete_own ON document_recipients FOR DELETE
  USING (user_id = auth.uid());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select_policy ON audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin')));
CREATE POLICY audit_logs_delete_policy ON audit_logs FOR DELETE
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

-- ===== PART 5: 2FA確認用ビュー =====
CREATE OR REPLACE VIEW v_2fa_migration_status AS
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN two_factor_enabled THEN 1 END) as users_with_2fa,
  ROUND(100.0 * COUNT(CASE WHEN two_factor_enabled THEN 1 END) / NULLIF(COUNT(*), 0), 2) as adoption_rate_percent
FROM users;

-- ===== 完了 =====
SELECT 'セットアップ完了' AS status, COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
