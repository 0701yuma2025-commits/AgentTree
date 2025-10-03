-- 報酬設定マスタテーブル作成
CREATE TABLE IF NOT EXISTS commission_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 最低支払額設定
    minimum_payment_amount DECIMAL(15, 2) DEFAULT 10000.00,

    -- 支払いサイクル設定
    payment_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (payment_cycle IN ('monthly', 'weekly', 'biweekly')),
    payment_day INTEGER DEFAULT 25 CHECK (payment_day >= 1 AND payment_day <= 31),

    -- 階層ボーナス設定（上位代理店への還元率）
    tier1_from_tier2_bonus DECIMAL(5, 2) DEFAULT 2.00,
    tier2_from_tier3_bonus DECIMAL(5, 2) DEFAULT 1.50,
    tier3_from_tier4_bonus DECIMAL(5, 2) DEFAULT 1.00,

    -- 締め日設定
    closing_day INTEGER DEFAULT 31 CHECK (closing_day >= 1 AND closing_day <= 31),

    -- 源泉徴収率（個人事業主用）
    withholding_tax_rate DECIMAL(5, 2) DEFAULT 10.21,

    -- インボイス未登録時の控除率
    non_invoice_deduction_rate DECIMAL(5, 2) DEFAULT 2.00,

    -- 設定有効期間
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,

    -- メタデータ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_commission_settings_active ON commission_settings(is_active);
CREATE INDEX IF NOT EXISTS idx_commission_settings_valid_dates ON commission_settings(valid_from, valid_to);

-- デフォルト設定を挿入
INSERT INTO commission_settings (
    minimum_payment_amount,
    payment_cycle,
    payment_day,
    closing_day,
    is_active
) VALUES (
    10000.00,
    'monthly',
    25,
    31,
    true
) ON CONFLICT DO NOTHING;

-- コメント追加
COMMENT ON TABLE commission_settings IS '報酬設定マスタテーブル';
COMMENT ON COLUMN commission_settings.minimum_payment_amount IS '最低支払額（これ未満は繰り越し）';
COMMENT ON COLUMN commission_settings.payment_cycle IS '支払いサイクル（monthly/weekly/biweekly）';
COMMENT ON COLUMN commission_settings.payment_day IS '支払い日（月次の場合の日付）';
COMMENT ON COLUMN commission_settings.tier1_from_tier2_bonus IS 'Tier2売上からTier1への還元率(%)';
COMMENT ON COLUMN commission_settings.tier2_from_tier3_bonus IS 'Tier3売上からTier2への還元率(%)';
COMMENT ON COLUMN commission_settings.tier3_from_tier4_bonus IS 'Tier4売上からTier3への還元率(%)';
COMMENT ON COLUMN commission_settings.closing_day IS '締め日';
COMMENT ON COLUMN commission_settings.withholding_tax_rate IS '源泉徴収率（個人事業主用）';
COMMENT ON COLUMN commission_settings.non_invoice_deduction_rate IS 'インボイス未登録時の控除率';