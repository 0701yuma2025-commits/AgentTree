/**
 * ダッシュボードルート 統合テスト
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

const dashboardRouter = require('../dashboard');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  return app;
}
function adminToken() { return jwt.sign({ id: 'u-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' }); }
function agencyToken() { return jwt.sign({ id: 'u-2', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/dashboard/stats', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/dashboard/stats')).status).toBe(401);
  });

  test('管理者 → 統計取得', async () => {
    // 複数のSupabaseクエリが走るので汎用レスポンスを返す
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null, count: 0 }));
    mockSupabase.single.mockResolvedValue({ data: null, error: null });

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /api/dashboard/charts', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('チャートデータ取得 → 200', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null }));
    const res = await request(app).get('/api/dashboard/charts?period=3months').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
