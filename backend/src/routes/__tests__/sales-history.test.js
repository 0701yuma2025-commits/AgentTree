/**
 * 売上変更履歴 テスト
 * GET /api/sales/:id/history
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();
jest.mock('../../config/supabase', () => ({ supabase: mockSupabase }));

jest.mock('../../utils/agencyHelpers', () => ({
  getSubordinateAgencyIds: jest.fn().mockResolvedValue(['ag-1', 'ag-child-1']),
}));

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

const historyRouter = require('../sales/history');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', historyRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = () => jwt.sign({ id: 'u-1', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
});

describe('GET /api/sales/:id/history', () => {
  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/sales/s-1/history')).status).toBe(401);
  });

  test('売上が存在しない → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).get('/api/sales/nonexistent/history')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  test('管理者 → 変更履歴返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { agency_id: 'ag-1' }, error: null });

    const historyData = [
      { id: 'h-1', field_name: 'total_amount', old_value: '100000', new_value: '120000', changed_at: '2026-01-15', changed_by: 'u-1', users: { full_name: '管理者', email: 'admin@test.com' } },
    ];
    mockSupabase.then.mockImplementation(r => r({ data: historyData, error: null }));

    const res = await request(app).get('/api/sales/s-1/history')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].field_name).toBe('total_amount');
    expect(res.body.data[0].changed_by.name).toBe('管理者');
  });

  test('代理店ユーザー（自社売上） → 変更履歴返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { agency_id: 'ag-1' }, error: null });
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null }));

    const res = await request(app).get('/api/sales/s-1/history')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('代理店ユーザー（他社売上） → 403', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { agency_id: 'ag-other' }, error: null });

    const res = await request(app).get('/api/sales/s-other/history')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(403);
  });
});
