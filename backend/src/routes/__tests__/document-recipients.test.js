/**
 * 書類送付先ルート 統合テスト
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

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
}));

const recipientsRouter = require('../document-recipients');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/document-recipients', recipientsRouter);
  return app;
}
function token(p) { return jwt.sign({ id: 'u-1', role: 'admin', ...p }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/document-recipients', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('一覧取得 → 200', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [{ id: 'dr-1', template_name: 'テンプレA' }], error: null }));
    const res = await request(app).get('/api/document-recipients').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/document-recipients')).status).toBe(401);
  });
});

describe('POST /api/document-recipients', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('正常作成 → 201', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'dr-new', template_name: '新テンプレ' },
      error: null,
    });
    const res = await request(app).post('/api/document-recipients')
      .set('Authorization', `Bearer ${token()}`)
      .send({ template_name: '新テンプレ', recipient_type: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /api/document-recipients/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
  });

  test('更新成功 → 200', async () => {
    // 権限チェック用の取得
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'dr-1', user_id: 'u-1' }, error: null,
    });
    // 更新結果
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'dr-1', template_name: '更新済み' }, error: null,
    });
    const res = await request(app).put('/api/document-recipients/dr-1')
      .set('Authorization', `Bearer ${token()}`)
      .send({ template_name: '更新済み' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/document-recipients/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
  });

  test('削除成功 → 200', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'dr-1', user_id: 'u-1' }, error: null });
    mockSupabase.then.mockImplementation(r => r({ data: null, error: null }));
    const res = await request(app).delete('/api/document-recipients/dr-1')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });
});
