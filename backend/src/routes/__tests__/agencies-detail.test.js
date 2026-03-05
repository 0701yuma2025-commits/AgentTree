/**
 * 代理店詳細取得 認可テスト
 * GET /api/agencies/:id
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();
jest.mock('../../config/supabase', () => ({ supabase: mockSupabase }));

// getSubordinateAgencyIds のモック
const mockGetSubordinateAgencyIds = jest.fn();
jest.mock('../../utils/agencyHelpers', () => ({
  getSubordinateAgencyIds: mockGetSubordinateAgencyIds,
  getSubordinateAgenciesWithDetails: jest.fn().mockResolvedValue([]),
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
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

jest.mock('../../services/emailService', () => ({
  sendAgencyApprovedEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../utils/generateCode', () => ({
  generateAgencyCode: jest.fn().mockResolvedValue('AG-0001'),
}));

jest.mock('../../middleware/rateLimiter', () => ({
  agencyCreationRateLimit: (req, res, next) => next(),
}));

const agenciesRouter = require('../agencies');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/agencies', agenciesRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = (agencyId = 'ag-1') => jwt.sign(
  { id: 'u-agency', role: 'agency', agency: { id: agencyId, tier_level: 1 } },
  JWT_SECRET, { expiresIn: '1h' }
);
const agencyTokenNoAgency = () => jwt.sign(
  { id: 'u-agency', role: 'agency' },
  JWT_SECRET, { expiresIn: '1h' }
);

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockGetSubordinateAgencyIds.mockReset();
});

// ═══════════════════════════════════════════════
// GET /api/agencies/:id - 認可チェック
// ═══════════════════════════════════════════════
describe('GET /api/agencies/:id', () => {
  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/agencies/ag-1');
    expect(res.status).toBe(401);
  });

  test('管理者 → 任意の代理店を閲覧可能', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'ag-99', company_name: 'テスト社', parent_agency_id: null }, error: null });

    const res = await request(app).get('/api/agencies/ag-99')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('ag-99');
  });

  test('代理店ユーザー → 自分自身の代理店は閲覧可能', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'ag-1', company_name: '自社', parent_agency_id: null }, error: null });

    const res = await request(app).get('/api/agencies/ag-1')
      .set('Authorization', `Bearer ${agencyToken('ag-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('ag-1');
    // 傘下チェックは呼ばれない（自分自身なので不要）
    expect(mockGetSubordinateAgencyIds).not.toHaveBeenCalled();
  });

  test('代理店ユーザー → 傘下代理店は閲覧可能', async () => {
    mockGetSubordinateAgencyIds.mockResolvedValue(['ag-1', 'ag-child-1', 'ag-child-2']);
    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'ag-child-1', company_name: '子会社', parent_agency_id: 'ag-1' }, error: null })
      .mockResolvedValueOnce({ data: { company_name: '自社' }, error: null }); // 親代理店名取得

    const res = await request(app).get('/api/agencies/ag-child-1')
      .set('Authorization', `Bearer ${agencyToken('ag-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('ag-child-1');
    expect(mockGetSubordinateAgencyIds).toHaveBeenCalledWith('ag-1');
  });

  test('代理店ユーザー → 無関係な代理店は403', async () => {
    mockGetSubordinateAgencyIds.mockResolvedValue(['ag-1']); // 傘下なし

    const res = await request(app).get('/api/agencies/ag-other')
      .set('Authorization', `Bearer ${agencyToken('ag-1')}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('権限');
  });

  test('代理店情報なしのユーザー → 403', async () => {
    const res = await request(app).get('/api/agencies/ag-1')
      .set('Authorization', `Bearer ${agencyTokenNoAgency()}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('代理店情報');
  });

  test('存在しない代理店 → 404', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).get('/api/agencies/nonexistent')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});
