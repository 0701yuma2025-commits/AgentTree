/**
 * コード生成ユーティリティ テスト
 */

const { createSupabaseMock } = require('./__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

const {
  generateAgencyCode,
  generateSaleNumber,
  generateProductCode,
  generatePaymentNumber,
} = require('../generateCode');

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.like.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
  mockSupabase.limit.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);

  // デフォルト: コード存在チェックは null（存在しない）
  mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-03-15'));
});

afterEach(() => {
  jest.useRealTimers();
});

// ══════════════════════════════════════════════════════════
// generateAgencyCode
// ══════════════════════════════════════════════════════════
describe('generateAgencyCode', () => {
  test('初回生成（既存なし） → AGN20260001', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const code = await generateAgencyCode();
    expect(code).toBe('AGN20260001');
  });

  test('既存コードあり → 連番インクリメント', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ agency_code: 'AGN20260042' }], error: null })
    );

    const code = await generateAgencyCode();
    expect(code).toBe('AGN20260043');
  });

  test('コード形式: AGN + 4桁年 + 4桁連番', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const code = await generateAgencyCode();
    expect(code).toMatch(/^AGN\d{4}\d{4}$/);
    expect(code.length).toBe(11);
  });

  test('コード重複時 → リトライして次の番号を生成', async () => {
    let callCount = 0;
    mockSupabase.then.mockImplementation((resolve) => {
      callCount++;
      if (callCount === 1) {
        // 1回目: MAX = AGN20260005
        return resolve({ data: [{ agency_code: 'AGN20260005' }], error: null });
      }
      // 2回目: MAX = AGN20260006（競合相手がINSERT済み）
      return resolve({ data: [{ agency_code: 'AGN20260006' }], error: null });
    });

    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'existing' }, error: null }) // 1回目: 存在する→リトライ
      .mockResolvedValueOnce({ data: null, error: null }); // 2回目: 存在しない→OK

    const code = await generateAgencyCode();
    expect(code).toBe('AGN20260007');
  });

  test('DBエラー → エラーをスロー', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );

    await expect(generateAgencyCode()).rejects.toThrow('代理店コードの生成に失敗しました');
  });
});

// ══════════════════════════════════════════════════════════
// generateSaleNumber
// ══════════════════════════════════════════════════════════
describe('generateSaleNumber', () => {
  test('初回生成 → SL20260300001', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const num = await generateSaleNumber();
    expect(num).toBe('SL20260300001');
  });

  test('既存番号あり → 連番インクリメント', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ sale_number: 'SL20260300123' }], error: null })
    );

    const num = await generateSaleNumber();
    expect(num).toBe('SL20260300124');
  });

  test('番号形式: SL + 4桁年 + 2桁月 + 5桁連番', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const num = await generateSaleNumber();
    expect(num).toMatch(/^SL\d{6}\d{5}$/);
    expect(num.length).toBe(13);
  });

  test('DBエラー → エラーをスロー', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );

    await expect(generateSaleNumber()).rejects.toThrow('売上番号の生成に失敗しました');
  });
});

// ══════════════════════════════════════════════════════════
// generateProductCode
// ══════════════════════════════════════════════════════════
describe('generateProductCode', () => {
  test('初回生成 → PROD20260001', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const code = await generateProductCode();
    expect(code).toBe('PROD20260001');
  });

  test('既存コードあり → 連番インクリメント', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ product_code: 'PROD20260005' }], error: null })
    );

    const code = await generateProductCode();
    expect(code).toBe('PROD20260006');
  });

  test('DBエラー → エラーをスロー', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );

    await expect(generateProductCode()).rejects.toThrow('商品コードの生成に失敗しました');
  });
});

// ══════════════════════════════════════════════════════════
// generatePaymentNumber
// ══════════════════════════════════════════════════════════
describe('generatePaymentNumber', () => {
  test('初回生成 → PAY2026030001', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const num = await generatePaymentNumber();
    expect(num).toBe('PAY2026030001');
  });

  test('既存番号あり → 連番インクリメント', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ payment_number: 'PAY2026030010' }], error: null })
    );

    const num = await generatePaymentNumber();
    expect(num).toBe('PAY2026030011');
  });

  test('リトライ上限超過 → エラーをスロー', async () => {
    // 5回とも既存コードが見つかる（全リトライ失敗）
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ payment_number: 'PAY2026030001' }], error: null })
    );
    mockSupabase.maybeSingle.mockResolvedValue({ data: { id: 'existing' }, error: null });

    await expect(generatePaymentNumber()).rejects.toThrow('支払い番号の生成に失敗しました');
  });

  test('その他のDBエラー → エラーをスロー', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: { code: 'PGRST500', message: 'internal error' } })
    );

    await expect(generatePaymentNumber()).rejects.toThrow('支払い番号の生成に失敗しました');
  });
});
