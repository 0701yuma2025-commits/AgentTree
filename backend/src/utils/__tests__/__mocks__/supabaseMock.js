/**
 * Supabase クライアント チェーンモック
 * `.from().select().eq().single()` 等のチェーンAPIを再現
 */

function createSupabaseMock() {
  const mock = {
    _returnData: null,
    _returnError: null,
    _returnCount: null,

    // チェーンメソッド（全て自身を返す）
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),

    // ターミナルメソッド（結果を返す）
    single: jest.fn(function () {
      return Promise.resolve({ data: mock._returnData, error: mock._returnError });
    }),
    maybeSingle: jest.fn(function () {
      return Promise.resolve({ data: mock._returnData, error: mock._returnError });
    }),

    // select等のデフォルトthen挙動（チェーン末尾でawaitした場合）
    then: jest.fn(function (resolve) {
      return resolve({
        data: mock._returnData,
        error: mock._returnError,
        count: mock._returnCount,
      });
    }),
  };

  // ヘルパー: 戻り値を設定
  mock.setReturnData = (data) => { mock._returnData = data; return mock; };
  mock.setReturnError = (error) => { mock._returnError = error; return mock; };
  mock.setReturnCount = (count) => { mock._returnCount = count; return mock; };

  // 全モックをリセット
  mock.resetAll = () => {
    mock._returnData = null;
    mock._returnError = null;
    mock._returnCount = null;
    Object.keys(mock).forEach((key) => {
      if (typeof mock[key] === 'function' && mock[key].mockClear) {
        mock[key].mockClear();
      }
    });
    return mock;
  };

  return mock;
}

module.exports = { createSupabaseMock };
