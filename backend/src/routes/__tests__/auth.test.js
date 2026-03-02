/**
 * 認証ルート 統合テスト
 * POST /api/auth/login, /api/auth/refresh, /api/auth/logout
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

// Supabase auth メソッドを追加
mockSupabase.auth = {
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
};

// 依存モジュールをモック
jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('../../middleware/rateLimiter', () => ({
  loginRateLimit: (req, res, next) => next(),
  passwordResetRateLimit: (req, res, next) => next(),
}));

jest.mock('../../middleware/auditLog', () => ({
  logLogin: jest.fn().mockResolvedValue(undefined),
  logLogout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/generateCode', () => ({
  generateAgencyCode: jest.fn().mockResolvedValue('AG-TEST001'),
  generateSaleNumber: jest.fn().mockResolvedValue('SL-TEST001'),
}));

jest.mock('../../utils/emailSender', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/passwordValidator', () => ({
  validatePassword: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
}));

// サブルーターもモック（独立性確保）
jest.mock('../auth/account', () => {
  const r = require('express').Router();
  return r;
});

jest.mock('../auth/two-factor', () => {
  const r = require('express').Router();
  r.generate6DigitCode = () => '123456';
  return r;
});

// auth ルーター読み込み
const authRouter = require('../auth');

// テスト用アプリ生成
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

// ── 定数 ──
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';

const TEST_USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  role: 'agency',
  full_name: 'テストユーザー',
  two_factor_enabled: false,
};

const TEST_AGENCY = {
  id: 'ag-001',
  agency_code: 'AG-001',
  company_name: 'テスト代理店',
  email: 'test@example.com',
  tier_level: 1,
  status: 'active',
};

// ── ヘルパー ──
function setupLoginSuccess(userProfile = TEST_USER, agency = TEST_AGENCY) {
  // Supabase auth 成功
  mockSupabase.auth.signInWithPassword.mockResolvedValue({
    data: {
      user: {
        id: userProfile.id,
        email: userProfile.email,
        user_metadata: { full_name: userProfile.full_name },
      },
    },
    error: null,
  });

  // ユーザープロフィール取得成功
  mockSupabase.single.mockResolvedValueOnce({
    data: userProfile,
    error: null,
  });

  // last_login_at 更新 (then が呼ばれる)
  mockSupabase.then.mockImplementationOnce((resolve) => resolve({
    data: null,
    error: null,
  }));

  // 代理店検索成功
  mockSupabase.single.mockResolvedValueOnce({
    data: agency,
    error: null,
  });
}

function createRefreshToken(payload = {}) {
  return jwt.sign(
    { id: TEST_USER.id, email: TEST_USER.email, role: 'agency', ...payload },
    JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
}

// ── テスト ──

describe('POST /api/auth/login', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
    app = createApp();
  });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.auth.signInWithPassword.mockReset();
    mockSupabase.auth.signOut.mockReset();
  });

  test('メール・パスワード未入力 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('必須');
  });

  test('メールのみ入力 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('Supabase認証失敗 → 401', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('間違っています');
  });

  test('正常ログイン → 200 + token + refreshToken + user', async () => {
    setupLoginSuccess();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'validpass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.role).toBe('agency');

    // token が有効なJWTか検証
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('agency');
  });

  test('レスポンスに success フィールドが必ず含まれる', async () => {
    // 失敗ケース
    const fail = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(fail.body).toHaveProperty('success');

    // 認証失敗ケース
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'error' },
    });
    const authFail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x' });
    expect(authFail.body).toHaveProperty('success');
  });
});

describe('POST /api/auth/refresh', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
    app = createApp();
  });

  test('リフレッシュトークンなし → 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('リフレッシュトークン');
  });

  test('無効なリフレッシュトークン → 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('期限切れリフレッシュトークン → 401', async () => {
    const expiredToken = jwt.sign(
      { id: TEST_USER.id, email: TEST_USER.email, role: 'agency' },
      JWT_REFRESH_SECRET,
      { expiresIn: '0s' }
    );

    // トークンが確実に期限切れになるまで少し待つ
    await new Promise(r => setTimeout(r, 100));

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('有効なリフレッシュトークン → 200 + 新トークン', async () => {
    const validRefresh = createRefreshToken();

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: validRefresh });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    // 新トークンが有効か検証
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.email).toBe(TEST_USER.email);
    expect(decoded.id).toBe(TEST_USER.id);
  });

  test('リフレッシュで得たトークンのロールが保持される', async () => {
    const adminRefresh = createRefreshToken({ role: 'admin' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: adminRefresh });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.role).toBe('admin');
  });
});

describe('POST /api/auth/logout', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    app = createApp();
  });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.auth.signOut.mockReset();
  });

  test('トークンなし → 401', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(401);
  });

  test('有効なトークンでログアウト → 200', async () => {
    const token = jwt.sign(
      { id: TEST_USER.id, email: TEST_USER.email, role: 'agency' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // authenticateToken がDBからユーザーを検索
    mockSupabase.single.mockResolvedValueOnce({
      data: TEST_USER,
      error: null,
    });

    mockSupabase.auth.signOut.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
