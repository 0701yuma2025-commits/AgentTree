/**
 * 支払い管理ルート 統合テスト
 * GET/POST /api/payments
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

jest.mock('../../utils/bankExport', () => ({
  generateZenginFormat: jest.fn().mockReturnValue('zengin-data'),
  generateCSVFormat: jest.fn().mockReturnValue('csv-data'),
  generateReadableFormat: jest.fn().mockReturnValue('readable-data'),
  convertToShiftJIS: jest.fn(data => Buffer.from(data)),
}));

const paymentsRouter = require('../payments');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  return app;
}

function adminToken() {
  return jwt.sign({ id: 'admin-1', email: 'admin@test.com', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
}

function agencyToken() {
  return jwt.sign({ id: 'user-1', email: 'user@test.com', role: 'agency' }, JWT_SECRET, { expiresIn: '1h' });
}

// ── テスト ──

describe('GET /api/payments/preview', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
  });

  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/payments/preview?month=2026-03');
    expect(res.status).toBe(401);
  });

  test('代理店ユーザー → 403', async () => {
    const res = await request(app)
      .get('/api/payments/preview?month=2026-03')
      .set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(403);
  });

  test('月パラメータなし → 400', async () => {
    const res = await request(app)
      .get('/api/payments/preview')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('対象月');
  });

  test('正常プレビュー → 200 + 集計データ', async () => {
    const commissions = [
      { id: 'c-1', agency_id: 'ag-1', base_amount: 10000, tier_bonus: 2000, campaign_bonus: 0, invoice_deduction: 0, withholding_tax: 1021, final_amount: 10979, agency: { id: 'ag-1', agency_code: 'AG-001', company_name: '代理店A', bank_account: { bank_code: '0001' }, invoice_registered: true } },
      { id: 'c-2', agency_id: 'ag-1', base_amount: 5000, tier_bonus: 0, campaign_bonus: 0, invoice_deduction: 0, withholding_tax: 0, final_amount: 5000, agency: { id: 'ag-1', agency_code: 'AG-001', company_name: '代理店A', bank_account: { bank_code: '0001' }, invoice_registered: true } },
    ];
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: commissions, error: null }));

    const res = await request(app)
      .get('/api/payments/preview?month=2026-03')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1); // 同一代理店に集約
    expect(res.body.data[0].final_amount).toBe(15979);
    expect(res.body.data[0].commission_ids).toHaveLength(2);
    expect(res.body.stats.total_agencies).toBe(1);
    expect(res.body.stats.total_amount).toBe(15979);
    expect(res.body.stats.missing_bank_info).toBe(0);
  });

  test('銀行口座情報なし → missing_bank_info カウント', async () => {
    const commissions = [
      { id: 'c-1', agency_id: 'ag-2', base_amount: 20000, tier_bonus: 0, campaign_bonus: 0, invoice_deduction: 0, withholding_tax: 0, final_amount: 20000, agency: { id: 'ag-2', agency_code: 'AG-002', company_name: '代理店B', bank_account: null, invoice_registered: false } },
    ];
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: commissions, error: null }));

    const res = await request(app)
      .get('/api/payments/preview?month=2026-03')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.missing_bank_info).toBe(1);
  });
});

describe('GET /api/payments/export', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
  });

  test('月パラメータなし → 400', async () => {
    const res = await request(app)
      .get('/api/payments/export')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  test('CSVエクスポート → ファイルダウンロード', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: [], error: null }));

    const res = await request(app)
      .get('/api/payments/export?month=2026-03&format=csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('payments_2026-03.csv');
  });

  test('全銀フォーマットエクスポート', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: [], error: null }));

    const res = await request(app)
      .get('/api/payments/export?month=2026-03&format=zengin')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('Shift_JIS');
    expect(res.headers['content-disposition']).toContain('transfer_202603.txt');
  });

  test('readableフォーマットエクスポート', async () => {
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: [], error: null }));

    const res = await request(app)
      .get('/api/payments/export?month=2026-03&format=readable')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('payment_details_2026-03.txt');
  });
});

describe('POST /api/payments/confirm', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  beforeEach(() => {
    mockSupabase.resetAll();
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.in.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
  });

  test('必須パラメータ不足 → 400', async () => {
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: '2026-03' }); // payment_date, agency_ids が不足
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('必須パラメータ');
  });

  test('空のagency_ids → 400', async () => {
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: '2026-03', payment_date: '2026-03-25', agency_ids: [] });
    expect(res.status).toBe(400);
  });

  test('正常確定 → 200 + 更新件数', async () => {
    const updatedCommissions = [
      { id: 'c-1', agency_id: 'ag-1', final_amount: 15000, status: 'paid' },
      { id: 'c-2', agency_id: 'ag-1', final_amount: 20000, status: 'paid' },
    ];
    // update().select()
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: updatedCommissions, error: null }));
    // payment_records insert
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ error: null }));

    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: '2026-03', payment_date: '2026-03-25', agency_ids: ['ag-1'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated_count).toBe(2);
    expect(res.body.data.total_amount).toBe(35000);
    expect(res.body.warning).toBeUndefined();
  });

  test('payment_records挿入失敗 → warning付き200', async () => {
    const updatedCommissions = [{ id: 'c-1', agency_id: 'ag-1', final_amount: 10000, status: 'paid' }];
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ data: updatedCommissions, error: null }));
    mockSupabase.then.mockImplementationOnce(resolve => resolve({ error: { message: 'insert error' } }));

    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: '2026-03', payment_date: '2026-03-25', agency_ids: ['ag-1'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeDefined();
    expect(res.body.warning).toContain('支払い履歴の記録に失敗');
  });

  test('代理店ユーザー → 403', async () => {
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ month: '2026-03', payment_date: '2026-03-25', agency_ids: ['ag-1'] });
    expect(res.status).toBe(403);
  });
});
