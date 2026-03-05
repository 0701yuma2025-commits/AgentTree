-- 複合インデックス追加（実際のクエリパターンに基づく）
-- 2026-03-05

-- 子代理店一覧取得（parent_agency_id + status）
CREATE INDEX IF NOT EXISTS idx_agencies_parent_status ON agencies(parent_agency_id, status);

-- 代理店別確定売上検索（agency_id + status）※ダッシュボード・異常検知で頻出
CREATE INDEX IF NOT EXISTS idx_sales_agency_status ON sales(agency_id, status);

-- 月次報酬検索（month + status）※請求書・月次レポートで頻出
CREATE INDEX IF NOT EXISTS idx_commissions_month_status ON commissions(month, status);
