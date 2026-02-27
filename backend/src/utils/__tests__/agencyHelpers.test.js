/**
 * 代理店ヘルパー関数 テスト
 */

const { createSupabaseMock } = require('./__mocks__/supabaseMock');

const mockSupabase = createSupabaseMock();

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase,
}));

const { getSubordinateAgencyIds } = require('../agencyHelpers');

beforeEach(() => {
  mockSupabase.resetAll();
  mockSupabase.from.mockReturnValue(mockSupabase);
  mockSupabase.select.mockReturnValue(mockSupabase);
  mockSupabase.eq.mockReturnValue(mockSupabase);
});

// ══════════════════════════════════════════════════════════
// getSubordinateAgencyIds
// ══════════════════════════════════════════════════════════
describe('getSubordinateAgencyIds', () => {
  test('子代理店なし → 自分のIDのみ返す', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: [], error: null })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent']);
  });

  test('直下の子代理店1つ → 2つのID', async () => {
    mockSupabase.then
      // 1回目: ag-parentの子を検索 → ag-child1
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'ag-child1' }], error: null })
      )
      // 2回目: ag-child1の子を検索 → なし
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent', 'ag-child1']);
  });

  test('2階層の子代理店 → 3つのID', async () => {
    mockSupabase.then
      // ag-parentの子 → ag-child1
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'ag-child1' }], error: null })
      )
      // ag-child1の子 → ag-grandchild1
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'ag-grandchild1' }], error: null })
      )
      // ag-grandchild1の子 → なし
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent', 'ag-child1', 'ag-grandchild1']);
  });

  test('複数の直下子代理店 → 全IDを含む', async () => {
    mockSupabase.then
      // ag-parentの子 → ag-child1, ag-child2
      .mockImplementationOnce((resolve) =>
        resolve({ data: [{ id: 'ag-child1' }, { id: 'ag-child2' }], error: null })
      )
      // ag-child1の子 → なし
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      )
      // ag-child2の子 → なし
      .mockImplementationOnce((resolve) =>
        resolve({ data: [], error: null })
      );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent', 'ag-child1', 'ag-child2']);
  });

  test('最大再帰深度に達した場合 → 自分のIDのみ返す', async () => {
    const result = await getSubordinateAgencyIds('ag-deep', 10);
    expect(result).toEqual(['ag-deep']);
  });

  test('data=null → 自分のIDのみ（安全に処理）', async () => {
    mockSupabase.then.mockImplementation((resolve) =>
      resolve({ data: null, error: null })
    );

    const result = await getSubordinateAgencyIds('ag-parent');
    expect(result).toEqual(['ag-parent']);
  });
});
