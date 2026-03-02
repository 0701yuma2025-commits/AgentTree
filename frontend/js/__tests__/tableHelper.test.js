/**
 * TableHelper テスト
 */

const fs = require('fs');
const path = require('path');

// TableHelper.jsを読み込み
const code = fs.readFileSync(path.resolve(__dirname, '../utils/tableHelper.js'), 'utf-8');
const mockWindow = {};
const fn = new Function('window', 'escapeHtml', code);
fn(mockWindow, global.escapeHtml);

const TableHelper = mockWindow.TableHelper;

function createHelper(overrides = {}) {
  return new TableHelper({
    itemsPerPage: 5,
    renderCallback: () => {},
    containerElement: { querySelector: () => null },
    ...overrides,
  });
}

const sampleData = [
  { id: 1, name: 'Alice', age: 30, score: 90 },
  { id: 2, name: 'Bob', age: 25, score: 85 },
  { id: 3, name: 'Charlie', age: 35, score: 95 },
  { id: 4, name: 'Diana', age: 28, score: 88 },
  { id: 5, name: 'Eve', age: 22, score: 92 },
  { id: 6, name: 'Frank', age: 40, score: 78 },
  { id: 7, name: 'Grace', age: 33, score: 96 },
];

// ═══════════════════════════════════════════════
// 基本操作
// ═══════════════════════════════════════════════
describe('TableHelper 基本操作', () => {
  test('データセット → filteredDataに反映', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    expect(helper.filteredData).toHaveLength(7);
  });

  test('null データ → 空配列', () => {
    const helper = createHelper();
    helper.setData(null);
    expect(helper.data).toEqual([]);
  });

  test('ページ数計算', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    expect(helper.getTotalPages()).toBe(3); // ceil(7/3) = 3
  });

  test('現在ページデータ取得', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    expect(helper.getCurrentPageData()).toHaveLength(3);
    expect(helper.getCurrentPageData()[0].name).toBe('Alice');
  });
});

// ═══════════════════════════════════════════════
// ページネーション
// ═══════════════════════════════════════════════
describe('TableHelper ページネーション', () => {
  test('2ページ目に移動', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    helper.setPage(2);
    expect(helper.currentPage).toBe(2);
    expect(helper.getCurrentPageData()[0].name).toBe('Diana');
  });

  test('範囲外のページ → 移動しない', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    helper.setPage(99);
    expect(helper.currentPage).toBe(1);
  });

  test('0ページ → 移動しない', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    helper.setPage(0);
    expect(helper.currentPage).toBe(1);
  });

  test('表示件数変更 → 1ページ目にリセット', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    helper.setPage(2);
    helper.setItemsPerPage(10);
    expect(helper.currentPage).toBe(1);
    expect(helper.itemsPerPage).toBe(10);
  });
});

// ═══════════════════════════════════════════════
// ソート
// ═══════════════════════════════════════════════
describe('TableHelper ソート', () => {
  test('名前で昇順ソート', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setSort('name');
    expect(helper.filteredData[0].name).toBe('Alice');
    expect(helper.sortDirection).toBe('asc');
  });

  test('同じ列を2回 → 降順に切替', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setSort('name');
    helper.setSort('name');
    expect(helper.sortDirection).toBe('desc');
    expect(helper.filteredData[0].name).toBe('Grace');
  });

  test('数値ソート（年齢昇順）', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setSort('age');
    expect(helper.filteredData[0].age).toBe(22); // Eve
    expect(helper.filteredData[6].age).toBe(40); // Frank
  });

  test('null値は末尾に', () => {
    const dataWithNull = [...sampleData, { id: 8, name: null, age: null, score: 50 }];
    const helper = createHelper();
    helper.setData(dataWithNull);
    helper.setSort('name');
    const lastItem = helper.filteredData[helper.filteredData.length - 1];
    expect(lastItem.name).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// フィルタ
// ═══════════════════════════════════════════════
describe('TableHelper フィルタ', () => {
  test('テキスト部分一致フィルタ', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setFilter('name', 'ali');
    expect(helper.filteredData).toHaveLength(1);
    expect(helper.filteredData[0].name).toBe('Alice');
  });

  test('空文字フィルタ → 全件表示', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setFilter('name', '');
    expect(helper.filteredData).toHaveLength(7);
  });

  test('関数フィルタ', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setFilter('custom', (item) => item.age >= 30);
    expect(helper.filteredData).toHaveLength(4); // Alice(30), Charlie(35), Frank(40), Grace(33)
  });

  test('複数フィルタ一括設定', () => {
    const helper = createHelper();
    helper.setData(sampleData);
    helper.setFilters({ name: 'a' }); // Alice, Charlie, Diana, Frank, Grace
    expect(helper.filteredData.length).toBeGreaterThan(0);
    helper.filteredData.forEach(item => {
      expect(item.name.toLowerCase()).toContain('a');
    });
  });

  test('フィルタ変更 → 1ページ目にリセット', () => {
    const helper = createHelper({ itemsPerPage: 3 });
    helper.setData(sampleData);
    helper.setPage(2);
    helper.setFilter('name', 'alice');
    expect(helper.currentPage).toBe(1);
  });
});
