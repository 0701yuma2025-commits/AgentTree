/**
 * 招待ルート 統合テスト
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();
mockSupabase.auth = { signUp: jest.fn() };
mockSupabase.rpc = jest.fn();

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

jest.mock('../../middleware/rateLimiter', () => ({
  loginRateLimit: (req, res, next) => next(),
}));

jest.mock('../../utils/emailSender', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/emailService', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

const invitationsRouter = require('../invitations');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invitations', invitationsRouter);
  return app;
}
function token(p) { return jwt.sign({ id: 'u-1', role: 'admin', ...p }, JWT_SECRET, { expiresIn: '1h' }); }

describe('GET /api/invitations', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/invitations')).status).toBe(401);
  });

  test('管理者 → 全招待取得', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [{ id: 'inv-1', email: 'a@b.com' }], error: null }));
    const res = await request(app).get('/api/invitations').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/invitations', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.rpc.mockReset();
  });

  test('バリデーションエラー → 400', async () => {
    const res = await request(app).post('/api/invitations')
      .set('Authorization', `Bearer ${token()}`)
      .send({ agency_id: 'not-uuid' });
    expect(res.status).toBe(400);
  });

  test('正常作成 → 201', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { id: 'inv-1', token: 'tok-123' }, error: null });
    const res = await request(app).post('/api/invitations')
      .set('Authorization', `Bearer ${token()}`)
      .send({ agency_id: '550e8400-e29b-41d4-a716-446655440000', email: 'new@test.com' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/invitations/validate/:token', () => {
  let app;
  beforeAll(() => { app = createApp(); });
  beforeEach(() => { mockSupabase.rpc.mockReset(); });

  test('有効なトークン → 200', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { valid: true, email: 'a@b.com' }, error: null });
    const res = await request(app).get('/api/invitations/validate/valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('無効なトークン → 400', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Invalid token' } });
    const res = await request(app).get('/api/invitations/validate/bad-token');
    expect(res.status).toBe(400);
  });
});
