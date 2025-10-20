-- 残業時専用日報テーブルの作成
-- Daily reports table for tracking overtime work activities

-- 日報ステータスの列挙型を作成
CREATE TYPE daily_report_status AS ENUM ('draft', 'submitted', 'approved', 'needs_revision');

-- 日報テーブル
CREATE TABLE IF NOT EXISTS daily_reports (
  -- 基本情報
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  overtime_hours DECIMAL(5, 2) NOT NULL DEFAULT 0,

  -- 目標設定（タスクと予定時間）
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 形式: [{"task": "タスク名", "estimated_hours": 2.5}, ...]

  -- 達成報告（完了タスクと実績時間）
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 形式: [{"task": "タスク名", "actual_hours": 3.0}, ...]

  -- 成果物・アウトプット
  deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 形式: [{"name": "成果物名", "filename": "ファイル名.ext"}, ...]

  -- 上長確認・修正履歴
  supervisor_confirmations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 形式: [{"supervisor_name": "山田太郎", "confirmed_at": "2025-01-15T10:30:00Z", "revision_number": 1, "comments": "修正内容"}, ...]

  -- 翌日への引継ぎ事項
  handoff_notes TEXT,

  -- 所感・コメント
  comments TEXT,

  -- 自動計算メトリクス
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 形式: {"output_per_hour": 1.5, "quality_score": 85, "achievement_rate": 95.5}

  -- ステータス
  status daily_report_status NOT NULL DEFAULT 'draft',

  -- タイムスタンプ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- 制約：1人1日1つの日報のみ
  UNIQUE(user_id, report_date)
);

-- インデックス作成
CREATE INDEX idx_daily_reports_user_id ON daily_reports(user_id);
CREATE INDEX idx_daily_reports_report_date ON daily_reports(report_date);
CREATE INDEX idx_daily_reports_status ON daily_reports(status);
CREATE INDEX idx_daily_reports_user_date ON daily_reports(user_id, report_date);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_daily_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_reports_updated_at();

-- コメント追加
COMMENT ON TABLE daily_reports IS '残業時専用日報テーブル';
COMMENT ON COLUMN daily_reports.goals IS '目標設定のJSON配列（タスク名と予定時間）';
COMMENT ON COLUMN daily_reports.achievements IS '達成報告のJSON配列（タスク名と実績時間）';
COMMENT ON COLUMN daily_reports.deliverables IS '成果物のJSON配列（名称とファイル名）';
COMMENT ON COLUMN daily_reports.supervisor_confirmations IS '上長確認・修正履歴のJSON配列';
COMMENT ON COLUMN daily_reports.metrics IS '自動計算されたメトリクス（時間単価、品質スコア、達成率など）';
