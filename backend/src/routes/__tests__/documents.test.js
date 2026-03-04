/**
 * 書類管理 テスト
 * GET /api/documents/:agencyId, POST /upload, PUT /:id/verify, DELETE /:id
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

// Storage モック
const mockStorageBucket = {
  upload: jest.fn().mockResolvedValue({ data: { path: 'test/file.pdf' }, error: null }),
  getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/ag-1/test.pdf' } }),
  remove: jest.fn().mockResolvedValue({ error: null }),
};
mockSupabase.storage = { from: jest.fn().mockReturnValue(mockStorageBucket) };

jest.mock('../../config/supabase', () => ({ supabase: mockSupabase }));

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false });
    try {
      req.user = require('jsonwebtoken').verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'test-key');
      next();
    } catch (e) { return res.status(401).json({ success: false }); }
  },
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

const { clearParentChildMapCache } = require('../../utils/agencyHelpers');
const documentRouter = require('../documents');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/documents', documentRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = () => jwt.sign({ id: 'u-1', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' });
const otherAgencyToken = () => jwt.sign({ id: 'u-2', role: 'agency', agency: { id: 'ag-other' } }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  clearParentChildMapCache();
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
  mockSupabase.update.mockReturnValue(mockSupabase);
  mockSupabase.insert.mockReturnValue(mockSupabase);
  mockSupabase.delete.mockReturnValue(mockSupabase);
  // Storage リセット
  mockStorageBucket.upload.mockResolvedValue({ data: { path: 'test/file.pdf' }, error: null });
  mockStorageBucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/ag-1/test.pdf' } });
  mockStorageBucket.remove.mockResolvedValue({ error: null });
  mockSupabase.storage.from.mockReturnValue(mockStorageBucket);
});

// ═══════════════════════════════════════════════
// GET /:agencyId
// ═══════════════════════════════════════════════
describe('GET /api/documents/:agencyId', () => {
  const docs = [
    { id: 'd-1', document_name: 'contract.pdf', document_type: 'contract', status: 'pending' },
    { id: 'd-2', document_name: 'id_card.jpg', document_type: 'identity', status: 'verified' },
  ];

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/documents/ag-1')).status).toBe(401);
  });

  test('管理者 → 書類一覧返却', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: docs, error: null }));

    const res = await request(app).get('/api/documents/ag-1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  test('自社代理店 → 書類一覧返却', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: docs, error: null }));

    const res = await request(app).get('/api/documents/ag-1')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('他社代理店（傘下でない） → 403', async () => {
    // getSubordinateAgencyIds: ag-otherの配下にag-targetは含まれない
    mockSupabase.then
      .mockImplementationOnce(r => r({ data: [
        { id: 'ag-other', parent_agency_id: null },
        { id: 'ag-target', parent_agency_id: null },
      ], error: null }));

    const res = await request(app).get('/api/documents/ag-target')
      .set('Authorization', `Bearer ${otherAgencyToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('アクセス権限');
  });

  test('傘下代理店 → 書類一覧返却', async () => {
    // getSubordinateAgencyIds: ag-1の配下にag-childが含まれる
    mockSupabase.then
      .mockImplementationOnce(r => r({ data: [
        { id: 'ag-1', parent_agency_id: null },
        { id: 'ag-child', parent_agency_id: 'ag-1' },
      ], error: null }))
      // ドキュメント一覧取得
      .mockImplementationOnce(r => r({ data: [], error: null }));

    const res = await request(app).get('/api/documents/ag-child')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /upload
// ═══════════════════════════════════════════════
describe('POST /api/documents/upload', () => {
  test('ファイルなし → 400', async () => {
    const res = await request(app).post('/api/documents/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ agency_id: 'ag-1', document_type: 'contract' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('ファイル');
  });

  test('他社代理店へアップロード（非管理者） → 403', async () => {
    const res = await request(app).post('/api/documents/upload')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .attach('document', Buffer.from('fake-pdf'), { filename: 'test.pdf', contentType: 'application/pdf' })
      .field('agency_id', 'ag-other')
      .field('document_type', 'contract');

    expect(res.status).toBe(403);
  });

  test('正常アップロード', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'd-new', agency_id: 'ag-1', document_name: 'test.pdf', status: 'pending' },
      error: null,
    });

    const res = await request(app).post('/api/documents/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('document', Buffer.from('fake-pdf'), { filename: 'test.pdf', contentType: 'application/pdf' })
      .field('agency_id', 'ag-1')
      .field('document_type', 'contract');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('アップロード');
    expect(mockStorageBucket.upload).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// PUT /:id/verify
// ═══════════════════════════════════════════════
describe('PUT /api/documents/:id/verify', () => {
  test('非管理者 → 403', async () => {
    const res = await request(app).put('/api/documents/d-1/verify')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ status: 'verified' });

    expect(res.status).toBe(403);
  });

  test('無効なステータス → 400', async () => {
    const res = await request(app).put('/api/documents/d-1/verify')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('無効なステータス');
  });

  test('承認成功', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'd-1', status: 'verified', verified_by: 'u-admin' },
      error: null,
    });

    const res = await request(app).put('/api/documents/d-1/verify')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'verified' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('承認');
  });

  test('却下（理由付き）', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'd-1', status: 'rejected', rejection_reason: '不鮮明' },
      error: null,
    });

    const res = await request(app).put('/api/documents/d-1/verify')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'rejected', rejection_reason: '不鮮明' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('却下');
  });
});

// ═══════════════════════════════════════════════
// DELETE /:id
// ═══════════════════════════════════════════════
describe('DELETE /api/documents/:id', () => {
  test('書類が見つからない → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app).delete('/api/documents/nonexistent')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  test('他社の書類を削除（非管理者） → 403', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'd-1', agency_id: 'ag-other', file_url: 'https://example.com/ag-other/file.pdf' },
      error: null,
    });

    const res = await request(app).delete('/api/documents/d-1')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(403);
  });

  test('正常削除', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'd-1', agency_id: 'ag-1', file_url: 'https://example.com/ag-1/file.pdf' },
      error: null,
    });
    mockSupabase.then.mockImplementation(r => r({ error: null }));

    const res = await request(app).delete('/api/documents/d-1')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('削除');
    expect(mockStorageBucket.remove).toHaveBeenCalled();
  });
});
