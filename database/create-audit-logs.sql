-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 誰が
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  ip_address VARCHAR(45),  -- IPv6対応
  user_agent TEXT,

  -- いつ
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- 何を
  action VARCHAR(50) NOT NULL,  -- 'create', 'read', 'update', 'delete', 'login', 'logout', 'export', etc.
  resource_type VARCHAR(100) NOT NULL,  -- 'agency', 'sale', 'commission', 'user', 'system_setting', etc.
  resource_id UUID,

  -- 詳細
  description TEXT,
  changes JSONB,  -- 変更前後の値 {"before": {...}, "after": {...}}
  metadata JSONB,  -- その他のメタデータ

  -- 結果
  status VARCHAR(20) DEFAULT 'success',  -- 'success', 'failure', 'error'
  error_message TEXT,

  -- インデックス用
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成（検索パフォーマンス向上）
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 複合インデックス（よく使う検索条件）
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- RLS (Row Level Security) ポリシー
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ全レコード閲覧可能
CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- 管理者のみ削除可能（通常は削除しない）
CREATE POLICY audit_logs_delete_policy ON audit_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- コメント
COMMENT ON TABLE audit_logs IS '監査ログ - すべての重要な操作を記録';
COMMENT ON COLUMN audit_logs.user_id IS '操作を実行したユーザーID';
COMMENT ON COLUMN audit_logs.action IS '操作種別（create/read/update/delete/login/logout/export等）';
COMMENT ON COLUMN audit_logs.resource_type IS 'リソース種別（agency/sale/commission/user等）';
COMMENT ON COLUMN audit_logs.resource_id IS 'リソースID';
COMMENT ON COLUMN audit_logs.changes IS '変更内容（変更前後の値をJSON形式で保存）';
COMMENT ON COLUMN audit_logs.status IS '操作結果（success/failure/error）';
