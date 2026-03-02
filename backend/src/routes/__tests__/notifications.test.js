/**
 * 通知ルート 統合テスト
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
      return res.status(403).json({ success: false });
    }
    next();
  },
}));

jest.mock('../../services/emailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/errorHelper', () => ({
  safeErrorMessage: jest.fn(e => e?.message || 'エラー'),
}));

const notificationsRouter = require('../notifications');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  return app;
}
function adminToken() { return jwt.sign({ id: 'u-1', email: 'a@t.com', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' }); }
function agencyToken() { return jwt.sign({ id: 'u-2', email: 'b@t.com', role: 'agency', agency_id: 'ag-1' }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/notifications/settings', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('設定取得 → 200', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'ns-1', email_notifications: true, sales_alerts: true },
      error: null,
    });
    const res = await request(app).get('/api/notifications/settings').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('設定なし → デフォルト返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const res = await request(app).get('/api/notifications/settings').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /api/notifications/unread-count', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.neq.mockReturnValue(mockSupabase);
  });

  test('未読件数取得 → 200', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null, count: 5 }));
    const res = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /api/notifications/:id/read', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('既読更新 → 200', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'n-1', status: 'read' }, error: null });
    const res = await request(app).put('/api/notifications/n-1/read').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/notifications/history', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.range.mockReturnValue(mockSupabase);
  });

  test('履歴取得 → 200 + ページネーション', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [{ id: 'n-1' }], error: null, count: 1 }));
    const res = await request(app).get('/api/notifications/history').set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
  });
});
