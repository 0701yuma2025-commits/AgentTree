/**
 * 報酬管理ルート 統合テスト
 * GET/POST/PUT /api/commissions
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('../../middleware/rateLimiter', () => ({
  loginRateLimit: (req, res, next) => next(),
  passwordResetRateLimit: (req, res, next) => next(),
}));

jest.mock('../../utils/calculateCommission', () => ({
  calculateMonthlyCommissions: jest.fn().mockReturnValue([]),
}));

jest.mock('../../utils/csvSanitizer', () => ({
  sanitizeCsvRow: jest.fn(row => row),
}));

// json2csv モック
jest.mock('json2csv', () => ({
  Parser: jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockReturnValue('csv-data'),
  })),
}));

// auth ミドルウェアモック
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: '認証が必要です' });
    try {
      const token = authHeader.split(' ')[1];
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'test-jwt-secret-key');
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ success: false, message: 'トークンが無効です' });
    }
  },
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

const commissionsRouter = require('../commissions');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/commissions', commissionsRouter);
  return app;
}

function createToken(payload) {
  return jwt.sign({ id: 'user-1', email: 'test@test.com', role: 'admin', ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

// ── テスト ──

describe('GET /api/commissions', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.range.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/commissions');
    expect(res.status).toBe(401);
  });

  test('無効な月パラメータ → 400', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: [], error: null, count: 0 }));
    const token = createToken();
    const res = await request(app)
      .get('/api/commissions?month=2026-13')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('YYYY-MM');
  });

  test('正常取得 → 200 + ページネーション付き', async () => {
    // 空データで基本構造を確認（複雑なthenモック不要）
    mockSupabase.then.mockImplementation(resolve => resolve({ data: [], error: null, count: 0 }));

    const token = createToken();
    const res = await request(app)
      .get('/api/commissions?month=2026-03')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.total).toBe(0);
  });

  test('代理店ユーザー → 自社データのみ', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: [], error: null, count: 0 }));
    const token = createToken({ role: 'agency', agency: { id: 'ag-1' } });
    const res = await request(app)
      .get('/api/commissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // agency_id フィルターが適用されることを確認
    expect(mockSupabase.eq).toHaveBeenCalledWith('agency_id', 'ag-1');
  });
});

describe('GET /api/commissions/summary', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('サマリー正常取得', async () => {
    const data = [
      { base_amount: 10000, tier_bonus: 2000, campaign_bonus: 500, final_amount: 12500, status: 'confirmed' },
      { base_amount: 8000, tier_bonus: 0, campaign_bonus: 0, final_amount: 8000, status: 'paid' },
    ];
    mockSupabase.then.mockImplementation(resolve => resolve({ data, error: null }));

    const token = createToken();
    const res = await request(app)
      .get('/api/commissions/summary?month=2026-03')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe('2026-03');
    expect(res.body.data.total_base).toBe(18000);
    expect(res.body.data.total_tier_bonus).toBe(2000);
    expect(res.body.data.total_final).toBe(20500);
    expect(res.body.data.confirmed_count).toBe(1);
    expect(res.body.data.paid_count).toBe(1);
  });

  test('無効な月 → 400', async () => {
    const token = createToken();
    const res = await request(app)
      .get('/api/commissions/summary?month=invalid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/commissions/calculate', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('代理店ユーザー → 403', async () => {
    const token = createToken({ role: 'agency' });
    const res = await request(app)
      .post('/api/commissions/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: '2026-03' });
    expect(res.status).toBe(403);
  });

  test('無効な月 → 400', async () => {
    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/commissions/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 'bad' });
    expect(res.status).toBe(400);
  });

  test('対象売上なし → 200 + メッセージ', async () => {
    // fromで呼ばれるテーブル名を追跡して適切なデータを返す
    let lastTable = '';
    mockSupabase.from.mockImplementation((table) => {
      lastTable = table;
      return mockSupabase;
    });
    mockSupabase.then.mockImplementation(resolve => {
      if (lastTable === 'sales') return resolve({ data: [], error: null });
      return resolve({ data: [], error: null });
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/commissions/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: '2026-03' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('売上データがありません');
  });
});

describe('PUT /api/commissions/:id/status', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('無効なステータス → 400', async () => {
    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/commissions/c-1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid_status' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('無効なステータス');
  });

  test('confirmed → 追加フィールド設定', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'c-1', status: 'confirmed', confirmed_at: '2026-03-01', confirmed_by: 'user-1' },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/commissions/c-1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // confirmed_at, confirmed_by が設定されることを確認
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', confirmed_by: 'user-1' })
    );
  });

  test('paid → paid_at/paid_by 設定', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'c-1', status: 'paid' },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/commissions/c-1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid' });

    expect(res.status).toBe(200);
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paid', paid_by: 'user-1' })
    );
  });

  test('代理店ユーザー → 403', async () => {
    const token = createToken({ role: 'agency' });
    const res = await request(app)
      .put('/api/commissions/c-1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/commissions/:id/approve', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('管理者 → 承認成功', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'c-1', status: 'approved' },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/commissions/c-1/approve')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('承認');
  });
});

describe('PUT /api/commissions/:id/pay', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('支払い済み更新成功', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'c-1', status: 'paid' },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/commissions/c-1/pay')
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_date: '2026-03-25', payment_method: 'bank_transfer' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('支払済み');
  });
});
