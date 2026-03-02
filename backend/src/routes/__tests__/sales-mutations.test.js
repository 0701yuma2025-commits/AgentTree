/**
 * 売上ルート(mutations) 統合テスト
 * POST /api/sales, PUT /api/sales/:id, DELETE /api/sales/:id
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createSupabaseMock } = require('../../utils/__tests__/__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

jest.mock('../../middleware/auth', () => {
  const mockJwt = require('jsonwebtoken');
  return {
    authenticateToken: (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ success: false, message: '認証が必要です' });
      }
      try {
        const token = authHeader.split(' ')[1];
        const decoded = mockJwt.verify(token, process.env.JWT_SECRET || 'test-jwt-secret-key');
        req.user = { ...decoded, agency: decoded.agency || null };
        next();
      } catch {
        return res.status(401).json({ success: false, message: 'トークンが無効です' });
      }
    },
    requireAdmin: (req, res, next) => {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: '管理者権限が必要です' });
      }
      next();
    },
  };
});

jest.mock('../../utils/calculateCommission', () => ({
  calculateCommissionForSale: jest.fn().mockReturnValue({
    base_amount: 8000,
    tier_bonus: 0,
    campaign_bonus: 0,
    final_amount: 7183,
    calculation_details: { withholding_tax: 817 },
    parent_commissions: [],
  }),
}));

jest.mock('../../utils/anomalyDetection', () => ({
  detectAnomalies: jest.fn().mockResolvedValue({
    has_anomaly: false,
    anomaly_score: 0,
    reasons: [],
  }),
}));

jest.mock('../../utils/generateCode', () => ({
  generateSaleNumber: jest.fn().mockResolvedValue('SL-20260301-0001'),
}));

jest.mock('../sales/anomaly', () => ({
  sendAnomalyNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/emailService', () => ({
  sendSalesNotification: jest.fn().mockResolvedValue(undefined),
}));

const salesMutationsRouter = require('../sales/mutations');

// テスト用アプリ
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', salesMutationsRouter);
  return app;
}

// ── 定数 ──
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'agent@example.com',
      role: 'agency',
      agency: { id: 'ag-001' },
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const AGENT_TOKEN = makeToken();
const ADMIN_TOKEN = makeToken({ role: 'admin', agency: null });
const OTHER_AGENT_TOKEN = makeToken({
  id: 'other-user-id',
  email: 'other@example.com',
  agency: { id: 'ag-999' },
});

// ── テスト ──

describe('POST /api/sales（売上登録）', () => {
  let app;

  beforeAll(() => {
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
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    const res = await request(app)
      .post('/api/sales')
      .send({});

    expect(res.status).toBe(401);
  });

  test('バリデーションエラー（product_idなし）→ 400', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({
        quantity: 1,
        customer_name: 'テスト顧客',
        sale_date: '2026-03-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('バリデーションエラー（数量0）→ 400', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({
        product_id: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 0,
        customer_name: 'テスト顧客',
        sale_date: '2026-03-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('商品が見つからない → 400', async () => {
    // 商品検索: null返却
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({
        product_id: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 1,
        customer_name: 'テスト顧客',
        sale_date: '2026-03-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('商品');
  });

  test('正常な売上登録 → 201', async () => {
    const saleData = {
      id: 'sale-001',
      sale_number: 'SL-20260301-0001',
      agency_id: 'ag-001',
      product_id: '550e8400-e29b-41d4-a716-446655440001',
      quantity: 2,
      unit_price: 50000,
      total_amount: 100000,
      customer_name: 'テスト顧客',
      sale_date: '2026-03-01',
      status: 'confirmed',
    };

    // 商品取得
    mockSupabase.single.mockResolvedValueOnce({
      data: { price: 50000 },
      error: null,
    });

    // 売上登録（insert → select → single）
    mockSupabase.single.mockResolvedValueOnce({
      data: saleData,
      error: null,
    });

    // 以降の報酬計算・通知等は全てthenで処理される
    mockSupabase.then.mockImplementation((resolve) => resolve({ data: null, error: null }));
    mockSupabase.single.mockResolvedValue({ data: null, error: null });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({
        product_id: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 2,
        customer_name: 'テスト顧客',
        sale_date: '2026-03-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.sale_number).toBe('SL-20260301-0001');
  });
});

describe('PUT /api/sales/:id（売上更新）', () => {
  let app;

  beforeAll(() => {
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
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
  });

  const existingSale = {
    id: 'sale-001',
    agency_id: 'ag-001',
    product_id: 'prod-001',
    quantity: 1,
    unit_price: 50000,
    total_amount: 50000,
    customer_name: '既存顧客',
    sale_date: '2026-02-01',
    status: 'pending',
  };

  test('認証なし → 401', async () => {
    const res = await request(app)
      .put('/api/sales/sale-001')
      .send({ customer_name: '新顧客' });

    expect(res.status).toBe(401);
  });

  test('不正な数量（0以下）→ 400', async () => {
    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('数量');
  });

  test('不正な単価（負数）→ 400', async () => {
    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ unit_price: -100 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('単価');
  });

  test('不正なステータス → 400', async () => {
    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('ステータス');
  });

  test('他代理店の売上を編集 → 403', async () => {
    // 既存売上を取得（ag-001所有）
    mockSupabase.single.mockResolvedValueOnce({
      data: existingSale,
      error: null,
    });

    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${OTHER_AGENT_TOKEN}`)
      .send({ customer_name: '不正変更' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('権限');
  });

  test('支払済み売上の編集 → 403（代理店）', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...existingSale, status: 'paid' },
      error: null,
    });

    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ customer_name: '変更' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('支払済み');
  });

  test('confirmed状態で金額フィールド編集 → 403（代理店）', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...existingSale, status: 'confirmed' },
      error: null,
    });

    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ quantity: 5 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('正常更新（pending状態）→ 200', async () => {
    // 既存売上
    mockSupabase.single.mockResolvedValueOnce({
      data: existingSale,
      error: null,
    });

    // 更新結果
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...existingSale, customer_name: '新顧客名' },
      error: null,
    });

    // 変更履歴保存
    mockSupabase.then.mockImplementation((resolve) => resolve({ data: null, error: null }));

    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ customer_name: '新顧客名' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customer_name).toBe('新顧客名');
  });

  test('変更なし → 200 + "変更はありませんでした"', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: existingSale,
      error: null,
    });

    const res = await request(app)
      .put('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`)
      .send({ customer_name: existingSale.customer_name });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('変更はありません');
  });
});

describe('DELETE /api/sales/:id（売上削除）', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    const res = await request(app).delete('/api/sales/sale-001');
    expect(res.status).toBe(401);
  });

  test('代理店ユーザーは削除不可 → 403', async () => {
    const res = await request(app)
      .delete('/api/sales/sale-001')
      .set('Authorization', `Bearer ${AGENT_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('権限');
  });

  test('管理者は削除可能 → 200', async () => {
    // notification_history削除（then）
    mockSupabase.then.mockImplementation((resolve) => resolve({ data: null, error: null }));

    // 売上削除（then）
    // deleteはチェーンの最後でawaitされるのでthenが呼ばれる

    const res = await request(app)
      .delete('/api/sales/sale-001')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('削除');
  });
});
