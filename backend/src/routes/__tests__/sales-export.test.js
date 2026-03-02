/**
 * 売上エクスポート・サマリー テスト
 * GET /api/sales/export, /summary
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();
jest.mock('../../config/supabase', () => ({ supabase: mockSupabase }));
jest.mock('../../utils/agencyHelpers', () => ({
  getSubordinateAgencyIds: jest.fn().mockResolvedValue(['ag-1']),
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

const exportRouter = require('../sales/export');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', exportRouter);
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
  mockSupabase.in.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
  mockSupabase.gte.mockReturnValue(mockSupabase);
  mockSupabase.lte.mockReturnValue(mockSupabase);
});

// ═══════════════════════════════════════════════
// GET /export
// ═══════════════════════════════════════════════
describe('GET /api/sales/export', () => {
  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/sales/export')).status).toBe(401);
  });

  test('管理者 → CSV形式で返却', async () => {
    const sales = [
      { id: 's-1', sale_number: 'S001', sale_date: '2026-01-15', agency_id: 'ag-1', product_id: 'p-1', quantity: 1, total_amount: 100000, status: 'confirmed' },
    ];
    // sales query
    mockSupabase.then
      .mockImplementationOnce(r => r({ data: sales, error: null }))
      // agencies query
      .mockImplementationOnce(r => r({ data: [{ id: 'ag-1', company_name: '代理店A', agency_code: 'AG001' }], error: null }))
      // products query
      .mockImplementationOnce(r => r({ data: [{ id: 'p-1', name: '商品A' }], error: null }));

    const res = await request(app).get('/api/sales/export')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('S001');
  });
});

// ═══════════════════════════════════════════════
// GET /summary
// ═══════════════════════════════════════════════
describe('GET /api/sales/summary', () => {
  test('デフォルトperiod=month → サマリー返却', async () => {
    const sales = [
      { total_amount: 100000, sale_date: '2026-01-10', status: 'confirmed' },
      { total_amount: 200000, sale_date: '2026-01-15', status: 'confirmed' },
    ];
    mockSupabase.then.mockImplementation(r => r({ data: sales, error: null }));

    const res = await request(app).get('/api/sales/summary')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_sales).toBe(300000);
    expect(res.body.data.total_count).toBe(2);
    expect(res.body.data.average_sale).toBe(150000);
  });

  test('無効なperiod → 400', async () => {
    const res = await request(app).get('/api/sales/summary?period=invalid')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  test('データなし → total_sales=0', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null }));

    const res = await request(app).get('/api/sales/summary')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_sales).toBe(0);
    expect(res.body.data.average_sale).toBe(0);
  });
});
