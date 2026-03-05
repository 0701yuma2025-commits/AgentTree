/**
 * 代理店ステータス管理 テスト
 * PUT /api/agencies/:id/approve, reject, reactivate, suspend
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

jest.mock('../../services/emailService', () => ({
  sendAgencyApprovedEmail: jest.fn().mockResolvedValue(true),
  sendAgencyRejectedEmail: jest.fn().mockResolvedValue(true),
  sendAgencySuspendedEmail: jest.fn().mockResolvedValue(true),
}));

const statusRouter = require('../agencies/status');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/agencies', statusRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = () => jwt.sign({ id: 'u-agency', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.update.mockReturnValue(mockSupabase);
});

// ═══════════════════════════════════════════════
// PUT /approve
// ═══════════════════════════════════════════════
describe('PUT /api/agencies/:id/approve', () => {
  test('認証なし → 401', async () => {
    const res = await request(app).put('/api/agencies/ag-1/approve');
    expect(res.status).toBe(401);
  });

  test('代理店ユーザー → 403', async () => {
    const res = await request(app).put('/api/agencies/ag-1/approve')
      .set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(403);
  });

  test('pending状態 → 承認成功', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'ag-1', status: 'active', contact_email: 'test@test.com' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/approve')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('active状態 → 400（承認待ちではない）', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { status: 'active' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/approve')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('承認待ち');
  });

  test('存在しない代理店 → 404', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app).put('/api/agencies/nonexistent/approve')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════
// PUT /reject
// ═══════════════════════════════════════════════
describe('PUT /api/agencies/:id/reject', () => {
  test('拒否理由なし → 400', async () => {
    const res = await request(app).put('/api/agencies/ag-1/reject')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('拒否理由');
  });

  test('正常に拒否', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null })
      .mockResolvedValueOnce({ data: { metadata: {} }, error: null })
      .mockResolvedValueOnce({ data: { id: 'ag-1', status: 'suspended' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/reject')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ rejection_reason: 'テスト拒否理由' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// PUT /reactivate
// ═══════════════════════════════════════════════
describe('PUT /api/agencies/:id/reactivate', () => {
  test('suspended状態 → 再有効化成功', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { status: 'suspended', metadata: {} }, error: null })
      .mockResolvedValueOnce({ data: { id: 'ag-1', status: 'active' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/reactivate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('active状態 → 400', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { status: 'active' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/reactivate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('停止中');
  });
});

// ═══════════════════════════════════════════════
// PUT /suspend
// ═══════════════════════════════════════════════
describe('PUT /api/agencies/:id/suspend', () => {
  test('停止理由なし → 400', async () => {
    const res = await request(app).put('/api/agencies/ag-1/suspend')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('停止理由');
  });

  test('正常に停止', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { metadata: {} }, error: null })
      .mockResolvedValueOnce({ data: { id: 'ag-1', status: 'suspended' }, error: null });

    const res = await request(app).put('/api/agencies/ag-1/suspend')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ suspension_reason: 'テスト停止理由' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
