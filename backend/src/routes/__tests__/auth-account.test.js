/**
 * アカウント管理 テスト
 * PUT /change-email, /change-password, POST /reset-password-request, /reset-password
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

// supabase.auth モック追加
mockSupabase.auth = {
  signInWithPassword: jest.fn(),
  updateUser: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  admin: {
    createUser: jest.fn(),
    updateUserById: jest.fn(),
  },
};

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
  passwordResetRateLimit: (req, res, next) => next(),
}));

jest.mock('../../utils/passwordValidator', () => ({
  validatePassword: (pw) => ({
    isValid: pw.length >= 8,
    errors: pw.length < 8 ? ['8文字以上'] : [],
    strength: pw.length >= 12 ? 'strong' : 'medium',
  }),
}));

jest.mock('../../utils/generateCode', () => ({
  generateAgencyCode: jest.fn().mockResolvedValue('AG999'),
}));

const accountRouter = require('../auth/account');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', accountRouter);
  return app;
}

const userToken = () => jwt.sign({ id: 'u-1', role: 'agency' }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.neq.mockReturnValue(mockSupabase);
  mockSupabase.update.mockReturnValue(mockSupabase);
  mockSupabase.insert.mockReturnValue(mockSupabase);
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════
// PUT /change-email
// ═══════════════════════════════════════════════
describe('PUT /api/auth/change-email', () => {
  test('認証なし → 401', async () => {
    expect((await request(app).put('/api/auth/change-email').send({})).status).toBe(401);
  });

  test('メールアドレスなし → 400', async () => {
    const res = await request(app).put('/api/auth/change-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ password: 'test123' });

    expect(res.status).toBe(400);
  });

  test('不正なメール形式 → 400', async () => {
    const res = await request(app).put('/api/auth/change-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ new_email: 'invalid', password: 'test123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('有効なメールアドレス');
  });

  test('パスワード不正 → 401', async () => {
    const bcrypt = require('bcrypt');
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'u-1', password_hash: await bcrypt.hash('correct', 10) },
      error: null,
    });

    const res = await request(app).put('/api/auth/change-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ new_email: 'new@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  test('メール重複 → 400', async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('correct', 10);
    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'u-1', password_hash: hash }, error: null })
      .mockResolvedValueOnce({ data: { id: 'u-other' }, error: null }); // 重複あり

    const res = await request(app).put('/api/auth/change-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ new_email: 'existing@test.com', password: 'correct' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('既に使用');
  });
});

// ═══════════════════════════════════════════════
// PUT /change-password
// ═══════════════════════════════════════════════
describe('PUT /api/auth/change-password', () => {
  test('現在のパスワードなし → 400', async () => {
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ new_password: 'newpassword123' });

    expect(res.status).toBe(400);
  });

  test('弱いパスワード → 400', async () => {
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ current_password: 'old123', new_password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('要件を満たしていません');
  });

  test('正常変更', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { email: 'user@test.com' }, error: null });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ current_password: 'oldPassword1!', new_password: 'newStrongPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /reset-password-request
// ═══════════════════════════════════════════════
describe('POST /api/auth/reset-password-request', () => {
  test('メールなし → 400', async () => {
    const res = await request(app).post('/api/auth/reset-password-request').send({});
    expect(res.status).toBe(400);
  });

  test('正常 → 常に成功メッセージ（セキュリティ）', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const res = await request(app).post('/api/auth/reset-password-request')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /reset-password
// ═══════════════════════════════════════════════
describe('POST /api/auth/reset-password', () => {
  test('トークンなし → 400', async () => {
    const res = await request(app).post('/api/auth/reset-password')
      .send({ new_password: 'newPassword1!' });
    expect(res.status).toBe(400);
  });

  test('弱いパスワード → 400', async () => {
    const res = await request(app).post('/api/auth/reset-password')
      .send({ token: 'valid-token', new_password: 'short' });
    expect(res.status).toBe(400);
  });

  test('正常リセット', async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    const res = await request(app).post('/api/auth/reset-password')
      .send({ token: 'valid-token', new_password: 'newStrongPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
