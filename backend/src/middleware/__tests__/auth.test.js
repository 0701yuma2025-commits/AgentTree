/**
 * 認証ミドルウェア テスト
 */

const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

// jest.mockの中で参照するため mock プレフィックス必須
const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

const {
  authenticateToken,
  requireAdmin,
  requireAgency,
} = require('../auth');

// ── ヘルパー ──────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function createToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options });
}

function createExpiredToken(payload) {
  // 過去の時刻を指定して期限切れトークンを生成
  return jwt.sign(
    { ...payload, iat: Math.floor(Date.now() / 1000) - 3600 },
    JWT_SECRET,
    { expiresIn: '1s' }
  );
}

function makeMockReq(overrides = {}) {
  return {
    headers: {},
    ...overrides,
  };
}

function makeMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeMockNext() {
  return jest.fn();
}

beforeEach(() => {
  mockSupabase.resetAll();
  // チェーンメソッドを再設定
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'not found' } });
});

// ══════════════════════════════════════════════════════════
// authenticateToken
// ══════════════════════════════════════════════════════════
describe('authenticateToken', () => {
  test('トークンなし → 401', async () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: true, message: expect.stringContaining('トークン') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('Authorization ヘッダーが空 → 401', async () => {
    const req = makeMockReq({ headers: { authorization: 'Bearer ' } });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('無効なトークン → 403 (INVALID_TOKEN)', async () => {
    const req = makeMockReq({
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('期限切れトークン → 401 (TOKEN_EXPIRED)', async () => {
    const token = createExpiredToken({
      id: 'user-1', email: 'test@test.com', role: 'agency',
    });

    const req = makeMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' })
    );
  });

  test('必須フィールドが欠けたトークン → 403', async () => {
    const token = createToken({ id: 'user-1', email: 'test@test.com' }); // roleなし

    const req = makeMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('正常トークン → next() 呼び出し、req.user設定', async () => {
    const payload = { id: 'user-1', email: 'test@test.com', role: 'admin' };
    const token = createToken(payload);

    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'user-1', email: 'test@test.com', name: 'テスト' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const req = makeMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-1');
    expect(req.user.email).toBe('test@test.com');
    expect(req.user.role).toBe('admin');
  });

  test('DB検索エラーでもJWT認証成功 → next() 呼び出し', async () => {
    const payload = { id: 'user-1', email: 'test@test.com', role: 'agency' };
    const token = createToken(payload);

    mockSupabase.single.mockRejectedValue(new Error('DB connection error'));

    const req = makeMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-1');
    expect(req.user.role).toBe('agency');
  });

  test('代理店ユーザー → agency情報がreq.userに追加', async () => {
    const payload = { id: 'user-1', email: 'agency@test.com', role: 'agency' };
    const token = createToken(payload);

    const agencyData = { id: 'ag-1', email: 'agency@test.com', company_name: 'テスト代理店' };

    mockSupabase.single
      .mockResolvedValueOnce({ data: { id: 'user-1', email: 'agency@test.com' }, error: null })
      .mockResolvedValueOnce({ data: agencyData, error: null });

    const req = makeMockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.agency).toBeDefined();
    expect(req.user.agency_id).toBe('ag-1');
  });
});

// ══════════════════════════════════════════════════════════
// requireAdmin
// ══════════════════════════════════════════════════════════
describe('requireAdmin', () => {
  test('admin → next() 許可', () => {
    const req = { user: { role: 'admin' } };
    const res = makeMockRes();
    const next = makeMockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('super_admin → next() 許可', () => {
    const req = { user: { role: 'super_admin' } };
    const res = makeMockRes();
    const next = makeMockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('agency → 403 拒否', () => {
    const req = { user: { role: 'agency' } };
    const res = makeMockRes();
    const next = makeMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('管理者権限') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('req.userなし → 403 拒否', () => {
    const req = {};
    const res = makeMockRes();
    const next = makeMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════
// requireAgency
// ══════════════════════════════════════════════════════════
describe('requireAgency', () => {
  test('agency → next() 許可', () => {
    const req = { user: { role: 'agency' } };
    const res = makeMockRes();
    const next = makeMockNext();

    requireAgency(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('admin → 403 拒否', () => {
    const req = { user: { role: 'admin' } };
    const res = makeMockRes();
    const next = makeMockNext();

    requireAgency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('代理店権限') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('req.userなし → 403 拒否', () => {
    const req = {};
    const res = makeMockRes();
    const next = makeMockNext();

    requireAgency(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
