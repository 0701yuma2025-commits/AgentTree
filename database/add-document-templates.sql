-- 書類宛先テンプレート機能追加
-- 実行日: 2025-10-13

-- 書類宛先テンプレートテーブル
CREATE TABLE IF NOT EXISTS document_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'admin', 'agency', 'custom'
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

-- インデックス
CREATE INDEX IF NOT EXISTS idx_document_recipients_user_id ON document_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_document_recipients_type ON document_recipients(recipient_type);
CREATE INDEX IF NOT EXISTS idx_document_recipients_favorite ON document_recipients(is_favorite);
CREATE INDEX IF NOT EXISTS idx_document_recipients_last_used ON document_recipients(last_used_at DESC);

-- 更新日時自動更新トリガー（既存の関数がある場合のみ）
-- CREATE TRIGGER update_document_recipients_updated_at BEFORE UPDATE ON document_recipients
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- デフォルト管理者宛先データ挿入（システム共通）
INSERT INTO document_recipients (
  template_name,
  recipient_type,
  company_name,
  postal_code,
  address,
  contact_person,
  department,
  phone,
  email,
  is_favorite
) VALUES (
  '営業代理店管理システム本部',
  'admin',
  '営業代理店管理システム',
  '100-0001',
  '東京都千代田区千代田1-1',
  '管理部',
  '経理課',
  '03-1234-5678',
  'info@agency-system.com',
  true
) ON CONFLICT DO NOTHING;

-- コメント追加
COMMENT ON TABLE document_recipients IS '書類生成時の宛先テンプレート管理';
COMMENT ON COLUMN document_recipients.recipient_type IS '宛先タイプ: admin=管理者宛, agency=代理店宛, custom=カスタム';
COMMENT ON COLUMN document_recipients.use_count IS '使用回数（人気順表示用）';
COMMENT ON COLUMN document_recipients.is_favorite IS 'お気に入りフラグ';
