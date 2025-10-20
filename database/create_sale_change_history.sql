-- 売上変更履歴テーブル作成
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

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_sale_change_history_sale_id ON sale_change_history(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_change_history_changed_at ON sale_change_history(changed_at DESC);

-- コメント追加
COMMENT ON TABLE sale_change_history IS '売上データの変更履歴を記録するテーブル';
COMMENT ON COLUMN sale_change_history.sale_id IS '変更された売上のID';
COMMENT ON COLUMN sale_change_history.changed_by IS '変更を行ったユーザーのID';
COMMENT ON COLUMN sale_change_history.changed_at IS '変更日時';
COMMENT ON COLUMN sale_change_history.field_name IS '変更されたフィールド名';
COMMENT ON COLUMN sale_change_history.old_value IS '変更前の値';
COMMENT ON COLUMN sale_change_history.new_value IS '変更後の値';
