/**
 * キャンペーンルート 統合テスト
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
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

jest.mock('../../utils/errorHelper', () => ({
  safeErrorMessage: jest.fn(e => e?.message || 'エラー'),
}));

const campaignsRouter = require('../campaigns');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns', campaignsRouter);
  return app;
}
function adminToken() { return jwt.sign({ id: 'u-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' }); }
function agencyToken() { return jwt.sign({ id: 'u-2', role: 'agency' }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/campaigns', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('一覧取得 → 200', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [{ id: 'c-1', name: 'テストキャンペーン', is_active: true }], error: null }));
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/campaigns')).status).toBe(401);
  });
});

describe('POST /api/campaigns', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('代理店 → 403', async () => {
    const res = await request(app).post('/api/campaigns')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ name: 'test' });
    expect(res.status).toBe(403);
  });

  test('必須項目不足 → 400', async () => {
    const res = await request(app).post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'test' }); // start_date, end_date等不足
    expect(res.status).toBe(400);
  });

  test('end_date <= start_date → 400', async () => {
    const res = await request(app).post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'テスト', start_date: '2026-04-01', end_date: '2026-03-01',
        bonus_type: 'percentage', bonus_value: 5, target_products: [], target_tiers: [1],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('終了日は開始日より後');
  });

  test('正常作成 → 201', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'camp-1', name: '新キャンペーン' }, error: null,
    });
    const res = await request(app).post('/api/campaigns')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: '新キャンペーン', start_date: '2026-04-01', end_date: '2026-05-01',
        bonus_type: 'percentage', bonus_value: 10, target_products: [], target_tiers: [1, 2],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/campaigns/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('管理者 → 論理削除成功', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'camp-1', is_active: false }, error: null });
    const res = await request(app).delete('/api/campaigns/camp-1').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('代理店 → 403', async () => {
    const res = await request(app).delete('/api/campaigns/camp-1').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(403);
  });
});
