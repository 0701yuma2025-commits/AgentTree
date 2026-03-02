/**
 * 商品管理ルート 統合テスト
 * GET/POST/PUT/DELETE /api/products
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
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: '管理者権限が必要です' });
    }
    next();
  },
}));

jest.mock('../../utils/generateCode', () => ({
  generateProductCode: jest.fn().mockResolvedValue('PRD-001'),
}));

jest.mock('../../utils/errorHelper', () => ({
  safeErrorMessage: jest.fn(err => err?.message || 'エラーが発生しました'),
}));

const productsRouter = require('../products');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  return app;
}

function createToken(payload) {
  return jwt.sign({ id: 'user-1', email: 'test@test.com', role: 'admin', ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

// ── テスト ──

describe('GET /api/products', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
  });

  test('商品一覧取得 → 200', async () => {
    const products = [
      { id: 'p-1', name: '商品A', price: 10000, product_code: 'PRD-001' },
      { id: 'p-2', name: '商品B', price: 20000, product_code: 'PRD-002' },
    ];
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: products, error: null }));

    const token = createToken();
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/products/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('存在する商品 → 200', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'p-1', name: '商品A', price: 10000 },
      error: null,
    });

    const token = createToken();
    const res = await request(app)
      .get('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('商品A');
  });

  test('存在しない商品 → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const token = createToken();
    const res = await request(app)
      .get('/api/products/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('見つかりません');
  });
});

describe('POST /api/products', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('必須項目不足 → 400', async () => {
    const token = createToken();
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_name: '商品A' }); // priceなし
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('必須');
  });

  test('正常登録 → 201', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'p-new', product_code: 'PRD-001', name: '新商品', price: 5000 },
      error: null,
    });

    const token = createToken();
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_name: '新商品', price: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('登録');
  });

  test('デフォルト報酬率が設定される', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'p-new' }, error: null });

    const token = createToken();
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_name: 'テスト', price: 1000 });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tier1_commission_rate: 10.00,
        tier2_commission_rate: 8.00,
        tier3_commission_rate: 6.00,
        tier4_commission_rate: 4.00,
      })
    );
  });

  test('重複商品コード → 409', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    });

    const token = createToken();
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_name: '重複', price: 1000 });

    expect(res.status).toBe(409);
  });

  test('代理店ユーザー → created_by_agency_id 設定', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'p-new' }, error: null });

    const token = createToken({ role: 'agency', agency_id: 'ag-1' });
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ product_name: 'テスト', price: 1000 });

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by_agency_id: 'ag-1' })
    );
  });
});

describe('PUT /api/products/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('管理者 → 全報酬率編集可能', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'p-1', name: '更新済み' },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .put('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '更新済み',
        commission_rate_tier1: 15.00,
        commission_rate_tier2: 12.00,
      });

    expect(res.status).toBe(200);
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tier1_commission_rate: 15.00,
        tier2_commission_rate: 12.00,
      })
    );
  });

  test('Tier2代理店 → Tier1報酬率は編集不可', async () => {
    // 代理店情報取得
    mockSupabase.single.mockResolvedValueOnce({
      data: { tier_level: 2 },
      error: null,
    });
    // 商品更新
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'p-1' },
      error: null,
    });

    const token = createToken({ role: 'agency', agency_id: 'ag-1' });
    await request(app)
      .put('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        commission_rate_tier1: 20.00, // これは無視されるべき
        commission_rate_tier2: 10.00,
        commission_rate_tier3: 7.00,
      });

    // tier1_commission_rate が含まれないことを確認
    const updateCall = mockSupabase.update.mock.calls[0][0];
    expect(updateCall.tier1_commission_rate).toBeUndefined();
    expect(updateCall.tier2_commission_rate).toBe(10.00);
    expect(updateCall.tier3_commission_rate).toBe(7.00);
  });

  test('Tier3代理店 → Tier1/2は編集不可、Tier3/4は編集可', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { tier_level: 3 }, error: null });
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });

    const token = createToken({ role: 'agency', agency_id: 'ag-1' });
    await request(app)
      .put('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        commission_rate_tier1: 20.00,
        commission_rate_tier2: 15.00,
        commission_rate_tier3: 8.00,
        commission_rate_tier4: 5.00,
      });

    const updateCall = mockSupabase.update.mock.calls[0][0];
    expect(updateCall.tier1_commission_rate).toBeUndefined();
    expect(updateCall.tier2_commission_rate).toBeUndefined();
    expect(updateCall.tier3_commission_rate).toBe(8.00);
    expect(updateCall.tier4_commission_rate).toBe(5.00);
  });

  test('Tier4代理店 → Tier4のみ編集可', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { tier_level: 4 }, error: null });
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });

    const token = createToken({ role: 'agency', agency_id: 'ag-1' });
    await request(app)
      .put('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        commission_rate_tier1: 20.00,
        commission_rate_tier3: 8.00,
        commission_rate_tier4: 5.00,
      });

    const updateCall = mockSupabase.update.mock.calls[0][0];
    expect(updateCall.tier1_commission_rate).toBeUndefined();
    expect(updateCall.tier3_commission_rate).toBeUndefined();
    expect(updateCall.tier4_commission_rate).toBe(5.00);
  });
});

describe('DELETE /api/products/:id', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
  });

  test('管理者 → 論理削除成功', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'p-1', is_active: false },
      error: null,
    });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .delete('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('削除');
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
  });

  test('代理店ユーザー → 403', async () => {
    const token = createToken({ role: 'agency' });
    const res = await request(app)
      .delete('/api/products/p-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('存在しない商品 → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const token = createToken({ role: 'admin' });
    const res = await request(app)
      .delete('/api/products/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
