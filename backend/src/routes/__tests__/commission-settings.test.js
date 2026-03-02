/**
 * 報酬設定ルート 統合テスト
 * GET/POST /api/commission-settings
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

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
}));

jest.mock('../../utils/errorHelper', () => ({
  safeErrorMessage: jest.fn(err => err?.message || 'エラーが発生しました'),
}));

const settingsRouter = require('../commission-settings');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/commission-settings', settingsRouter);
  return app;
}

function createToken(payload) {
  return jwt.sign({ id: 'user-1', email: 'test@test.com', role: 'admin', ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

// ── テスト ──

describe('GET /api/commission-settings/current', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
  });

  test('設定あり → 200 + データ', async () => {
    const settings = {
      id: 's-1',
      minimum_payment_amount: 15000,
      payment_cycle: 'monthly',
      payment_day: 25,
      closing_day: 31,
      tier1_from_tier2_bonus: 3.00,
      tier2_from_tier3_bonus: 2.00,
      tier3_from_tier4_bonus: 1.50,
      withholding_tax_rate: 10.21,
      non_invoice_deduction_rate: 2.00,
      is_active: true,
    };
    mockSupabase.single.mockResolvedValueOnce({ data: settings, error: null });

    const token = createToken();
    const res = await request(app)
      .get('/api/commission-settings/current')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.minimum_payment_amount).toBe(15000);
    expect(res.body.data.tier1_from_tier2_bonus).toBe(3.00);
  });

  test('設定なし → デフォルト値返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'not found' } });

    const token = createToken();
    const res = await request(app)
      .get('/api/commission-settings/current')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.minimum_payment_amount).toBe(10000);
    expect(res.body.data.payment_day).toBe(25);
    expect(res.body.data.tier1_from_tier2_bonus).toBe(2.00);
  });

  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/commission-settings/current');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/commission-settings/history', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('管理者 → 200 + 履歴データ', async () => {
    const history = [
      { id: 's-1', is_active: true, created_at: '2026-03-01' },
      { id: 's-2', is_active: false, created_at: '2026-02-01' },
    ];
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: history, error: null }));

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .get('/api/commission-settings/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('代理店ユーザー → 403', async () => {
    const token = createToken({ role: 'agency' });
    const res = await request(app)
      .get('/api/commission-settings/history')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('権限');
  });
});

describe('POST /api/commission-settings', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('管理者 → 201 + 新設定作成', async () => {
    // 既存設定の無効化
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: null, error: null }));
    // 新設定INSERT
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 's-new',
        minimum_payment_amount: 20000,
        tier1_from_tier2_bonus: 3.00,
        is_active: true,
      },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/commission-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        minimum_payment_amount: 20000,
        tier1_from_tier2_bonus: 3.00,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('更新');
    expect(res.body.data.minimum_payment_amount).toBe(20000);
  });

  test('代理店ユーザー → 403', async () => {
    const token = createToken({ role: 'agency' });
    const res = await request(app)
      .post('/api/commission-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ minimum_payment_amount: 20000 });
    expect(res.status).toBe(403);
  });

  test('既存設定を無効化してから新規作成', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: null, error: null }));
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 's-new', is_active: true }, error: null });

    const token = createToken({ role: 'admin' });
    await request(app)
      .post('/api/commission-settings')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // update で is_active=false に設定されることを確認
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
    // insert で is_active=true に設定されることを確認
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: true, created_by: 'user-1' })
    );
  });
});

describe('GET /api/commission-settings/next-payment-date', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('設定あり → 次回支払日計算', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { payment_cycle: 'monthly', payment_day: 25, closing_day: 31 },
      error: null,
    });

    const token = createToken();
    const res = await request(app)
      .get('/api/commission-settings/next-payment-date')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.next_payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.data.payment_cycle).toBe('monthly');
    expect(res.body.data.payment_day).toBe(25);
  });

  test('設定なし → デフォルト値で計算', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const token = createToken();
    const res = await request(app)
      .get('/api/commission-settings/next-payment-date')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payment_cycle).toBe('monthly');
    expect(res.body.data.payment_day).toBe(25);
  });
});
