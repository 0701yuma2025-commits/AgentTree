/**
 * ネットワークルート 統合テスト
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

const networkRouter = require('../network');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/network', networkRouter);
  return app;
}
function adminToken() { return jwt.sign({ id: 'u-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/network/agencies', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/network/agencies')).status).toBe(401);
  });

  test('管理者 → nodes+links形式で返却', async () => {
    const agencies = [
      { id: 'ag-1', company_name: '代理店A', tier_level: 1, parent_agency_id: null, status: 'active' },
      { id: 'ag-2', company_name: '代理店B', tier_level: 2, parent_agency_id: 'ag-1', status: 'active' },
    ];
    // agencies query
    mockSupabase.then.mockImplementation(r => r({ data: agencies, error: null }));

    const res = await request(app).get('/api/network/agencies').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nodes).toBeDefined();
    expect(res.body.data.links).toBeDefined();
  });
});
