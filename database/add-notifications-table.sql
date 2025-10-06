-- 通知設定テーブル
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- 通知タイプごとの設定
  new_sale_notification BOOLEAN DEFAULT true,        -- 新規売上通知
  commission_confirmed BOOLEAN DEFAULT true,          -- 報酬確定通知
  invitation_accepted BOOLEAN DEFAULT true,           -- 招待承認通知
  monthly_report BOOLEAN DEFAULT true,               -- 月次レポート通知
  system_announcement BOOLEAN DEFAULT true,          -- システムお知らせ

  -- 通知方法
  email_enabled BOOLEAN DEFAULT true,                -- メール通知
  in_app_enabled BOOLEAN DEFAULT true,               -- アプリ内通知

  -- 通知頻度設定
  notification_frequency VARCHAR(20) DEFAULT 'realtime' CHECK (notification_frequency IN ('realtime', 'daily', 'weekly', 'monthly')),

  -- 通知時間設定（日次・週次・月次の場合）
  notification_time TIME DEFAULT '09:00:00',
  notification_day_of_week INTEGER DEFAULT 1 CHECK (notification_day_of_week BETWEEN 1 AND 7), -- 1=月曜日
  notification_day_of_month INTEGER DEFAULT 1 CHECK (notification_day_of_month BETWEEN 1 AND 31),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 通知履歴テーブル
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,

  -- 通知情報
  notification_type VARCHAR(50) NOT NULL,            -- 通知タイプ
  subject VARCHAR(255) NOT NULL,                     -- 件名
  content TEXT NOT NULL,                             -- 内容

  -- 送信情報
  sent_to VARCHAR(255),                              -- 送信先メールアドレス
  sent_method VARCHAR(20) CHECK (sent_method IN ('email', 'in_app', 'both')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- ステータス
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  error_message TEXT,                                -- エラーメッセージ（送信失敗時）
  read_at TIMESTAMP WITH TIME ZONE,                  -- 既読時刻

  -- 関連データ
  related_data JSONB,                                -- 関連データ（売上ID、報酬IDなど）

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 通知テンプレートテーブル
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_code VARCHAR(50) UNIQUE NOT NULL,         -- テンプレートコード
  template_name VARCHAR(100) NOT NULL,               -- テンプレート名

  -- メール内容
  subject_template TEXT NOT NULL,                    -- 件名テンプレート
  body_template TEXT NOT NULL,                       -- 本文テンプレート（HTML）
  body_text_template TEXT,                           -- 本文テンプレート（プレーンテキスト）

  -- 変数定義
  variables JSONB,                                   -- 使用可能な変数のリスト

  -- 設定
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_notification_settings_agency ON notification_settings(agency_id);
CREATE INDEX idx_notification_history_agency ON notification_history(agency_id);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_sent_at ON notification_history(sent_at);
CREATE INDEX idx_notification_templates_code ON notification_templates(template_code);

-- デフォルトの通知テンプレートを挿入
INSERT INTO notification_templates (template_code, template_name, subject_template, body_template, variables) VALUES
(
  'welcome_agency',
  '代理店登録完了',
  '代理店登録完了のお知らせ',
  '<h2>{{company_name}} 様</h2><p>代理店登録が完了しました。代理店コード: {{agency_code}}</p>',
  '{"company_name": "会社名", "agency_code": "代理店コード"}'::jsonb
),
(
  'new_sale',
  '新規売上通知',
  '新規売上登録 [売上番号: {{sale_number}}]',
  '<p>新規売上が登録されました。</p><p>売上番号: {{sale_number}}<br>金額: ¥{{sale_amount}}</p>',
  '{"sale_number": "売上番号", "sale_amount": "売上金額"}'::jsonb
),
(
  'commission_confirmed',
  '報酬確定通知',
  '{{month}} 報酬確定のお知らせ',
  '<p>{{month}}の報酬が確定しました。</p><p>報酬額: ¥{{commission_amount}}</p>',
  '{"month": "対象月", "commission_amount": "報酬額"}'::jsonb
),
(
  'invitation_sent',
  '招待メール',
  '代理店登録のご招待',
  '<p>{{parent_agency_name}} から招待が届いています。</p><p>招待コード: {{invitation_code}}</p>',
  '{"parent_agency_name": "親代理店名", "invitation_code": "招待コード"}'::jsonb
);

-- 通知設定の自動作成トリガー
CREATE OR REPLACE FUNCTION create_default_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- 新規代理店登録時にデフォルトの通知設定を作成
  INSERT INTO notification_settings (agency_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_create_notification_settings ON agencies;
CREATE TRIGGER trigger_create_notification_settings
  AFTER INSERT ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_settings();