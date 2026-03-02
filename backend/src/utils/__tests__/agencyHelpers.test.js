/**
 * 代理店ヘルパー関数 テスト
 */

const { createSupabaseMock } = require('./__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

const { getSubordinateAgencyIds, getSubordinateAgenciesWithDetails } = require('../agencyHelpers');

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
  mockSupabase.in.mockReturnValue(mockSupabase);
  mockSupabase.order.mockReturnValue(mockSupabase);
});

// ══════════════════════════════════════════════════════════
// getSubordinateAgencyIds（1クエリ+メモリBFS方式）
// ══════════════════════════════════════════════════════════
describe('getSubordinateAgencyIds', () => {
  test('子代理店なし → 自分のIDのみ返す', async () => {
    // 全代理店を返すクエリ（parentがいるだけで子はいない）
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ id: 'ag-parent', parent_agency_id: null }], error: null })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent']);
  });

  test('直下の子代理店1つ → 2つのID', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { id: 'ag-parent', parent_agency_id: null },
          { id: 'ag-child1', parent_agency_id: 'ag-parent' },
        ],
        error: null,
      })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toContain('ag-parent');
    expect(result).toContain('ag-child1');
    expect(result).toHaveLength(2);
  });

  test('2階層の子代理店 → 3つのID', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { id: 'ag-parent', parent_agency_id: null },
          { id: 'ag-child1', parent_agency_id: 'ag-parent' },
          { id: 'ag-grandchild1', parent_agency_id: 'ag-child1' },
        ],
        error: null,
      })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toContain('ag-parent');
    expect(result).toContain('ag-child1');
    expect(result).toContain('ag-grandchild1');
    expect(result).toHaveLength(3);
  });

  test('複数の直下子代理店 → 全IDを含む', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { id: 'ag-parent', parent_agency_id: null },
          { id: 'ag-child1', parent_agency_id: 'ag-parent' },
          { id: 'ag-child2', parent_agency_id: 'ag-parent' },
        ],
        error: null,
      })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toContain('ag-parent');
    expect(result).toContain('ag-child1');
    expect(result).toContain('ag-child2');
    expect(result).toHaveLength(3);
  });

  test('data=null → 自分のIDのみ（安全に処理）', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent']);
  });

  test('他の代理店ツリーの子は含まない', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { id: 'ag-parent', parent_agency_id: null },
          { id: 'ag-child1', parent_agency_id: 'ag-parent' },
          { id: 'ag-other', parent_agency_id: null },
          { id: 'ag-other-child', parent_agency_id: 'ag-other' },
        ],
        error: null,
      })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toContain('ag-parent');
    expect(result).toContain('ag-child1');
    expect(result).not.toContain('ag-other');
    expect(result).not.toContain('ag-other-child');
    expect(result).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════
// getSubordinateAgenciesWithDetails
// ══════════════════════════════════════════════════════════
describe('getSubordinateAgenciesWithDetails', () => {
  test('子代理店なし → 空配列', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [{ id: 'ag-parent', parent_agency_id: null, company_name: 'Parent', tier_level: 1, status: 'active', agency_code: 'P001', contact_email: 'p@test.com', created_at: '2026-01-01' }], error: null })
    );

    const result = await getSubordinateAgenciesWithDetails('ag-parent');
    expect(result).toEqual([]);
  });

  test('子代理店あり → hierarchy_level付きで返す', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({
        data: [
          { id: 'ag-parent', parent_agency_id: null, company_name: 'Parent', tier_level: 1, status: 'active', agency_code: 'P001', contact_email: 'p@test.com', created_at: '2026-01-01' },
          { id: 'ag-child1', parent_agency_id: 'ag-parent', company_name: 'Child1', tier_level: 2, status: 'active', agency_code: 'C001', contact_email: 'c@test.com', created_at: '2026-01-02' },
        ],
        error: null,
      })
    );

    const result = await getSubordinateAgenciesWithDetails('ag-parent');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ag-child1');
    expect(result[0].hierarchy_level).toBe(1);
    expect(result[0]).not.toHaveProperty('parent_agency_id');
  });
});
