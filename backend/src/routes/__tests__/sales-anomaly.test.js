/**
 * 売上異常検知ルート テスト
 * GET /api/sales/anomalies, PUT /api/sales/:id/review
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

jest.mock('../../services/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(true) }));

const anomalyRouter = require('../sales/anomaly');
const JWT_SECRET = process.env.JWT_SECRET || 'test-key';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sales', anomalyRouter);
  return app;
}

const adminToken = () => jwt.sign({ id: 'u-admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const agencyToken = () => jwt.sign({ id: 'u-agency', role: 'agency', agency: { id: 'ag-1' } }, JWT_SECRET, { expiresIn: '1h' });

let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
  mockSupabase.gte.mockReturnValue(mockSupabase);
  mockSupabase.lte.mockReturnValue(mockSupabase);
  mockSupabase.update.mockReturnValue(mockSupabase);
});

// ═══════════════════════════════════════════════
// GET /anomalies
// ═══════════════════════════════════════════════
describe('GET /api/sales/anomalies', () => {
  test('認証なし → 401', async () => {
    const res = await request(app).get('/api/sales/anomalies');
    expect(res.status).toBe(401);
  });

  test('代理店ユーザー → 403', async () => {
    const res = await request(app).get('/api/sales/anomalies')
      .set('Authorization', `Bearer ${agencyToken()}`);
    expect(res.status).toBe(403);
  });

  test('管理者 → 異常売上一覧とサマリー', async () => {
    const anomalies = [
      { id: 's-1', anomaly_score: 85, requires_review: true, sale_number: 'S001' },
      { id: 's-2', anomaly_score: 60, requires_review: false, sale_number: 'S002' },
    ];
    mockSupabase.then.mockImplementation(r => r({ data: anomalies, error: null }));

    const res = await request(app).get('/api/sales/anomalies')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.total_anomalies).toBe(2);
    expect(res.body.summary.pending_review).toBe(1);
    expect(res.body.summary.high_score_count).toBe(1);
  });

  test('データなし → 空配列', async () => {
    mockSupabase.then.mockImplementation(r => r({ data: [], error: null }));

    const res = await request(app).get('/api/sales/anomalies')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.summary.total_anomalies).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// PUT /:id/review
// ═══════════════════════════════════════════════
describe('PUT /api/sales/:id/review', () => {
  test('代理店ユーザー → 403', async () => {
    const res = await request(app).put('/api/sales/s-1/review')
      .set('Authorization', `Bearer ${agencyToken()}`)
      .send({ review_status: 'approved' });
    expect(res.status).toBe(403);
  });

  test('管理者 → レビュー完了', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { id: 's-1', requires_review: false, review_status: 'approved' },
      error: null,
    });

    const res = await request(app).put('/api/sales/s-1/review')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ review_status: 'approved', review_notes: 'OK確認済み' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('無効なreview_status → 400', async () => {
    const res = await request(app).put('/api/sales/s-1/review')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ review_status: 'invalid_status' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('review_status');
  });
});
