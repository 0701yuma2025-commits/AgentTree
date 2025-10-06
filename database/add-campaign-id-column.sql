-- commissionsテーブルにcampaign_idカラムを追加
-- このカラムはどのキャンペーンによる報酬ボーナスかを記録するために使用されます

ALTER TABLE commissions
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

-- カラムにコメントを追加
COMMENT ON COLUMN commissions.campaign_id IS 'キャンペーンボーナスが適用されたキャンペーンのID';

-- インデックスを追加（キャンペーン別の報酬を素早く検索するため）
CREATE INDEX IF NOT EXISTS idx_commissions_campaign_id
ON commissions(campaign_id)
WHERE campaign_id IS NOT NULL;

-- 既存のcampaign_bonusが0より大きいレコードの分析用インデックス
CREATE INDEX IF NOT EXISTS idx_commissions_campaign_bonus
ON commissions(campaign_bonus)
WHERE campaign_bonus > 0;