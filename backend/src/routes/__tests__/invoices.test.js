/**
 * 請求書・領収書 テスト
 * POST /generate, /receipt, /generate-from-sale, /receipt-from-sale,
 *      /admin-monthly-summary, /receipt-monthly
 * GET /agencies, /
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
}));

jest.mock('../../utils/pdf-generator', () => ({
  generateInvoicePDF: jest.fn().mockResolvedValue(Buffer.from('fake-invoice-pdf')),
  generateReceiptPDF: jest.fn().mockResolvedValue(Buffer.from('fake-receipt-pdf')),
  generatePaymentStatementPDF: jest.fn().mockResolvedValue(Buffer.from('fake-statement-pdf')),
}));

const invoiceRouter = require('../invoices');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', invoiceRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = () => jwt.sign({ id: 'u-1', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' });

// 共通テストデータ
const commissionData = {
  id: 'c-1',
  month: '2026-01',
  agency_id: 'ag-1',
  base_amount: 50000,
  tier_bonus: 10000,
  campaign_bonus: 0,
  withholding_tax: 5000,
  final_amount: 55000,
  carry_forward: 0,
  status: 'paid',
  calculation_details: {},
  agencies: {
    id: 'ag-1', company_name: '代理店A', agency_code: 'AG001',
    representative_name: '山田太郎', address: '東京都港区', postal_code: '100-0001',
    contact_email: 'test@test.com', contact_phone: '03-1234-5678',
    invoice_number: 'T1234567890123', bank_account: null,
  },
  sales: { sale_number: 'S001', product_id: 'p-1', total_amount: 100000 },
};

const saleData = {
  id: 's-1', sale_number: 'S001', sale_date: '2026-01-15',
  customer_name: 'テスト顧客', quantity: 1, unit_price: 100000, total_amount: 100000,
  products: { id: 'p-1', name: '商品A', price: 100000 },
  agencies: {
    id: 'ag-1', company_name: '代理店A', agency_code: 'AG001',
    representative_name: '山田太郎', postal_code: '100-0001', address: '東京都港区',
    contact_phone: '03-1234-5678', contact_email: 'test@test.com',
    invoice_number: 'T1234567890123', bank_account: null,
  },
};

let app;
let savedInvoiceRegNumber;
beforeAll(() => {
  app = createApp();
  savedInvoiceRegNumber = process.env.INVOICE_REGISTRATION_NUMBER;
});
afterAll(() => {
  if (savedInvoiceRegNumber !== undefined) {
    process.env.INVOICE_REGISTRATION_NUMBER = savedInvoiceRegNumber;
  } else {
    delete process.env.INVOICE_REGISTRATION_NUMBER;
  }
});

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
  mockSupabase.limit.mockReturnValue(mockSupabase);
  // receipt/receipt-monthly で getOperatorInvoiceNumber をenv変数で短絡
  process.env.INVOICE_REGISTRATION_NUMBER = 'T1234567890123';
});

// ═══════════════════════════════════════════════
// POST /generate (請求書)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/generate', () => {
  test('パラメータなし → 400', async () => {
    const res = await request(app).post('/api/invoices/generate')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('報酬IDまたは対象月');
  });

  test('報酬データなし → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).post('/api/invoices/generate')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ commission_id: 'nonexistent' });

    expect(res.status).toBe(404);
  });

  test('正常 → PDF返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: commissionData, error: null });

    const res = await request(app).post('/api/invoices/generate')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ commission_id: 'c-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('invoice_');
  });
});

// ═══════════════════════════════════════════════
// POST /receipt (領収書)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/receipt', () => {
  const paymentData = {
    id: 'pay-1', payment_date: '2026-02-01', payment_amount: 55000, agency_id: 'ag-1',
    commissions: {
      ...commissionData,
      month: '2026-01',
    },
  };

  test('payment_idなし → 400', async () => {
    const res = await request(app).post('/api/invoices/receipt')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('支払いID');
  });

  test('支払いデータなし → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).post('/api/invoices/receipt')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ payment_id: 'nonexistent' });

    expect(res.status).toBe(404);
  });

  test('正常 → PDF返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: paymentData, error: null });

    const res = await request(app).post('/api/invoices/receipt')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ payment_id: 'pay-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('receipt_');
  });
});

// ═══════════════════════════════════════════════
// POST /generate-from-sale (売上ベース請求書)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/generate-from-sale', () => {
  test('sale_idなし → 400', async () => {
    const res = await request(app).post('/api/invoices/generate-from-sale')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('売上ID');
  });

  test('売上データなし → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).post('/api/invoices/generate-from-sale')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ sale_id: 'nonexistent' });

    expect(res.status).toBe(404);
  });

  test('正常 → PDF返却', async () => {
    // sale query
    mockSupabase.single
      .mockResolvedValueOnce({ data: saleData, error: null })
      // commission query (optional, may not exist)
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app).post('/api/invoices/generate-from-sale')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ sale_id: 's-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});

// ═══════════════════════════════════════════════
// POST /receipt-from-sale (売上ベース領収書)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/receipt-from-sale', () => {
  test('sale_idなし → 400', async () => {
    const res = await request(app).post('/api/invoices/receipt-from-sale')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('正常 → PDF返却', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: saleData, error: null });

    const res = await request(app).post('/api/invoices/receipt-from-sale')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ sale_id: 's-1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('receipt_');
  });
});

// ═══════════════════════════════════════════════
// POST /admin-monthly-summary (管理者月次集計)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/admin-monthly-summary', () => {
  test('非管理者 → 403', async () => {
    const res = await request(app).post('/api/invoices/admin-monthly-summary')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ agency_id: 'ag-1', month: '2026-01' });

    expect(res.status).toBe(403);
  });

  test('パラメータ不足 → 400', async () => {
    const res = await request(app).post('/api/invoices/admin-monthly-summary')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ agency_id: 'ag-1' }); // monthなし

    expect(res.status).toBe(400);
  });

  test('代理店が見つからない → 404', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const res = await request(app).post('/api/invoices/admin-monthly-summary')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ agency_id: 'nonexistent', month: '2026-01' });

    expect(res.status).toBe(404);
  });

  test('正常 → PDF返却', async () => {
    const agencyData = { id: 'ag-1', company_name: '代理店A', agency_code: 'AG001', tier_level: 1, bank_account: null };
    const commissionsArr = [{
      base_amount: 50000, tier_bonus: 10000, campaign_bonus: 0,
      withholding_tax: 5000, final_amount: 55000, status: 'paid',
      sales: { sale_number: 'S001', product_id: 'p-1', total_amount: 100000, sale_date: '2026-01-15' },
    }];

    mockSupabase.single.mockResolvedValueOnce({ data: agencyData, error: null });
    mockSupabase.then.mockImplementation(r => r({ data: commissionsArr, error: null }));

    const res = await request(app).post('/api/invoices/admin-monthly-summary')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ agency_id: 'ag-1', month: '2026-01' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('admin_monthly_summary');
  });
});

// ═══════════════════════════════════════════════
// POST /receipt-monthly (月次領収書)
// ═══════════════════════════════════════════════
describe('POST /api/invoices/receipt-monthly', () => {
  test('月なし → 400', async () => {
    const res = await request(app).post('/api/invoices/receipt-monthly')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('支払済みデータなし → 404', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null }));

    const res = await request(app).post('/api/invoices/receipt-monthly')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ month: '2026-01' });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('支払済み報酬');
  });

  test('正常 → PDF返却', async () => {
    const commissions = [{
      final_amount: 55000, base_amount: 50000, tier_bonus: 10000,
      withholding_tax: 5000,
      agencies: {
        company_name: '代理店A', agency_code: 'AG001', representative_name: '山田太郎',
        postal_code: '100-0001', address: '東京都港区',
        contact_phone: '03-1234-5678', contact_email: 'test@test.com',
        invoice_number: 'T1234567890123',
      },
    }];
    mockSupabase.then.mockImplementation(r => r({ data: commissions, error: null }));

    const res = await request(app).post('/api/invoices/receipt-monthly')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ month: '2026-01' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});

// ═══════════════════════════════════════════════
// GET /agencies (管理者向け代理店一覧)
// ═══════════════════════════════════════════════
describe('GET /api/invoices/agencies', () => {
  test('非管理者 → 403', async () => {
    const res = await request(app).get('/api/invoices/agencies')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(403);
  });

  test('管理者 → 代理店一覧', async () => {
    const agencies = [
      { id: 'ag-1', company_name: '代理店A', agency_code: 'AG001', tier_level: 1, status: 'active' },
    ];
    mockSupabase.then.mockImplementation(r => r({ data: agencies, error: null }));

    const res = await request(app).get('/api/invoices/agencies')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════
// GET / (請求書一覧)
// ═══════════════════════════════════════════════
describe('GET /api/invoices', () => {
  const invoiceListData = [{
    id: 'c-1', month: '2026-01', agency_id: 'ag-1234-5678',
    base_amount: 50000, tier_bonus: 10000, campaign_bonus: 0,
    withholding_tax: 5000, final_amount: 55000, status: 'paid', created_at: '2026-01-15',
    agencies: { id: 'ag-1', company_name: '代理店A', agency_code: 'AG001' },
    sales: { sale_number: 'S001' },
  }];

  test('認証なし → 401', async () => {
    expect((await request(app).get('/api/invoices')).status).toBe(401);
  });

  test('管理者 → 全請求書一覧', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: invoiceListData, error: null }));

    const res = await request(app).get('/api/invoices')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].invoiceNumber).toContain('INV-');
    expect(res.body.data[0].status).toBe('支払済');
  });

  test('代理店ユーザー → 自社請求書のみ', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: invoiceListData, error: null }));

    const res = await request(app).get('/api/invoices')
      .set('Authorization', `Bearer ${agencyToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // eq がagency_idで絞り込みに使われていることを確認
    expect(mockSupabase.eq).toHaveBeenCalledWith('agency_id', 'ag-1');
  });
});
