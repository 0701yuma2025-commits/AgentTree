-- 書類管理テーブルの作成
CREATE TABLE IF NOT EXISTS agency_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- registration_certificate, seal_certificate, bank_statement, id_card, other
  document_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending', -- pending, verified, rejected
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_agency_documents_agency_id ON agency_documents(agency_id);
CREATE INDEX idx_agency_documents_status ON agency_documents(status);
CREATE INDEX idx_agency_documents_type ON agency_documents(document_type);

-- コメントの追加
COMMENT ON TABLE agency_documents IS '代理店提出書類管理';
COMMENT ON COLUMN agency_documents.document_type IS '書類種別: registration_certificate(登記簿謄本), seal_certificate(印鑑証明), bank_statement(口座確認書), id_card(身分証明書), other(その他)';
COMMENT ON COLUMN agency_documents.status IS '確認状態: pending(未確認), verified(確認済), rejected(却下)';