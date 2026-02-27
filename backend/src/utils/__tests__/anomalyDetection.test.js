/**
 * 異常検知ユーティリティ テスト
 */

// Supabase モック - jest.mockの中で参照するため mock プレフィックス必須
const { createSupabaseMock } = require('./__mocks__/supabaseMock');
const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

const {
  calculateAnomalyScore,
  detectAbnormalAmount,
  detectSalesSpike,
  detectRapidSalesEntry,
  detectAnomalies,
} = require('../anomalyDetection');

// ── ヘルパー ──────────────────────────────────────────────

function makeSale(overrides = {}) {
  return {
    id: 'sale-1',
    agency_id: 'ag-1',
    total_amount: 100000,
    sale_date: '2026-02-15',
    ...overrides,
  };
}

beforeEach(() => {
  mockSupabase.resetAll();
  // チェーンメソッドを再設定
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.neq.mockReturnValue(mockSupabase);
  mockSupabase.gte.mockReturnValue(mockSupabase);
  mockSupabase.lt.mockReturnValue(mockSupabase);
  mockSupabase.limit.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
});

// ══════════════════════════════════════════════════════════
// calculateAnomalyScore（Pure関数）
// ══════════════════════════════════════════════════════════
describe('calculateAnomalyScore', () => {
  test('全て未検知 → スコア0', () => {
    const results = {
      spike: { detected: false },
      rapid_entry: { detected: false },
      abnormal_amount: { detected: false },
    };
    expect(calculateAnomalyScore(results)).toBe(0);
  });

  test('全て検知（最大スコア） → 100', () => {
    const results = {
      spike: { detected: true, growth_rate: 10000 },
      rapid_entry: { detected: true, count: 200, threshold: 50 },
      abnormal_amount: { detected: true, z_score: 10 },
    };
    expect(calculateAnomalyScore(results)).toBe(100);
  });

  test('スパイクのみ検知（500%増） → 10点', () => {
    const results = {
      spike: { detected: true, growth_rate: 500 },
      rapid_entry: { detected: false },
      abnormal_amount: { detected: false },
    };
    expect(calculateAnomalyScore(results)).toBe(10);
  });

  test('大量登録のみ検知（threshold 2倍） → 30点', () => {
    const results = {
      spike: { detected: false },
      rapid_entry: { detected: true, count: 100, threshold: 50 },
      abnormal_amount: { detected: false },
    };
    expect(calculateAnomalyScore(results)).toBe(30);
  });

  test('異常金額のみ検知（z_score=4） → 20点', () => {
    const results = {
      spike: { detected: false },
      rapid_entry: { detected: false },
      abnormal_amount: { detected: true, z_score: 4 },
    };
    expect(calculateAnomalyScore(results)).toBe(20);
  });

  test('部分検知（スパイク + 異常金額）', () => {
    const results = {
      spike: { detected: true, growth_rate: 1000 },
      rapid_entry: { detected: false },
      abnormal_amount: { detected: true, z_score: 3.5 },
    };
    expect(calculateAnomalyScore(results)).toBe(38);
  });
});

// ══════════════════════════════════════════════════════════
// detectAbnormalAmount（Mockあり）
// ══════════════════════════════════════════════════════════
describe('detectAbnormalAmount', () => {
  test('絶対上限超過 → 検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );
    const sale = makeSale({ total_amount: 15000000 });
    const result = await detectAbnormalAmount(sale, 10000000);
    expect(result.detected).toBe(true);
    expect(result.reason).toContain('上限値');
  });

  test('履歴データ不足（5件未満） → 未検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ total_amount: 100000 }], error: null })
    );
    const sale = makeSale({ total_amount: 100000 });
    const result = await detectAbnormalAmount(sale);
    expect(result.detected).toBe(false);
    expect(result.reason).toBe('履歴データ不足');
  });

  test('正常金額（平均付近） → 未検知', async () => {
    const historicalData = Array.from({ length: 10 }, () => ({ total_amount: 100000 }));
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: historicalData, error: null })
    );
    const sale = makeSale({ total_amount: 100000 });
    const result = await detectAbnormalAmount(sale);
    expect(result.detected).toBe(false);
  });

  test('異常金額（3σ超過） → 検知', async () => {
    const historicalData = Array.from({ length: 10 }, () => ({ total_amount: 100000 }));
    historicalData[0] = { total_amount: 110000 };
    historicalData[1] = { total_amount: 90000 };
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: historicalData, error: null })
    );
    const sale = makeSale({ total_amount: 1000000 });
    const result = await detectAbnormalAmount(sale);
    expect(result.detected).toBe(true);
    expect(result.z_score).toBeGreaterThan(3);
  });

  test('標準偏差0（全額同一）→ z_scoreがInfinity → 検知', async () => {
    const historicalData = Array.from({ length: 10 }, () => ({ total_amount: 100000 }));
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: historicalData, error: null })
    );
    const sale = makeSale({ total_amount: 200000 });
    const result = await detectAbnormalAmount(sale);
    expect(result.detected).toBe(true);
    expect(result.z_score).toBe(Infinity);
  });

  test('DBエラー → 未検知（エラー情報含む）', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );
    const sale = makeSale();
    const result = await detectAbnormalAmount(sale);
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// detectSalesSpike（Mockあり）
// ══════════════════════════════════════════════════════════
describe('detectSalesSpike', () => {
  test('前月売上なし → 未検知', async () => {
    mockSupabase.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      );

    const sale = makeSale({ total_amount: 100000 });
    const result = await detectSalesSpike(sale);
    expect(result.detected).toBe(false);
    expect(result.reason).toBe('前月売上なし');
  });

  test('正常な増加（100%増） → 未検知', async () => {
    mockSupabase.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      );

    const sale = makeSale({ total_amount: 100000 });
    const result = await detectSalesSpike(sale);
    expect(result.detected).toBe(false);
  });

  test('スパイク検出（600%増） → 検知', async () => {
    mockSupabase.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 500000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      );

    const sale = makeSale({ total_amount: 500000 });
    const result = await detectSalesSpike(sale);
    expect(result.detected).toBe(true);
    expect(result.growth_rate).toBeGreaterThanOrEqual(500);
  });

  test('DBエラー → 未検知（エラー情報含む）', async () => {
    mockSupabase.then.mockImplementationOnce((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );

    const sale = makeSale();
    const result = await detectSalesSpike(sale);
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// detectRapidSalesEntry（Mockあり）
// ══════════════════════════════════════════════════════════
describe('detectRapidSalesEntry', () => {
  test('正常ペース（10件） → 未検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null, count: 10 })
    );
    const result = await detectRapidSalesEntry('ag-1');
    expect(result.detected).toBe(false);
    expect(result.count).toBe(10);
  });

  test('短時間大量登録（60件/24時間） → 検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null, count: 60 })
    );
    const result = await detectRapidSalesEntry('ag-1');
    expect(result.detected).toBe(true);
    expect(result.reason).toContain('60件');
  });

  test('閾値ちょうど（50件） → 検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null, count: 50 })
    );
    const result = await detectRapidSalesEntry('ag-1');
    expect(result.detected).toBe(true);
  });

  test('カスタム設定（12時間/20件上限） → 検知', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null, count: 25 })
    );
    const result = await detectRapidSalesEntry('ag-1', 12, 20);
    expect(result.detected).toBe(true);
    expect(result.threshold).toBe(20);
    expect(result.time_window_hours).toBe(12);
  });

  test('DBエラー → 未検知（エラー情報含む）', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );
    const result = await detectRapidSalesEntry('ag-1');
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// detectAnomalies（統合テスト）
// ══════════════════════════════════════════════════════════
describe('detectAnomalies', () => {
  test('異常なし → has_anomaly=false', async () => {
    mockSupabase.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: null, error: null, count: 5 })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      );

    const sale = makeSale({ total_amount: 100000 });
    const result = await detectAnomalies(sale);
    expect(result.has_anomaly).toBe(false);
    expect(result.anomaly_score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  test('複数の異常 → has_anomaly=true, requires_review=true', async () => {
    mockSupabase.then
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 5000000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ total_amount: 100000 }], error: null })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: null, error: null, count: 60 })
      )
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      );

    const sale = makeSale({ total_amount: 15000000 });
    const result = await detectAnomalies(sale);
    expect(result.has_anomaly).toBe(true);
    expect(result.requires_review).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    expect(result.anomaly_score).toBeGreaterThan(0);
    expect(result.timestamp).toBeDefined();
  });
});
