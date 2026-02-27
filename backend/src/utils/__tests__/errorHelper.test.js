/**
 * エラーレスポンスヘルパー テスト
 */

const { safeErrorMessage } = require('../errorHelper');

describe('safeErrorMessage', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('development環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    test('エラーメッセージをそのまま返す', () => {
      const error = new Error('DB connection failed');
      expect(safeErrorMessage(error)).toBe('DB connection failed');
    });

    test('error.messageが空 → fallbackメッセージ', () => {
      const error = new Error('');
      expect(safeErrorMessage(error)).toBe('サーバーエラーが発生しました');
    });

    test('カスタムfallbackメッセージ', () => {
      const error = new Error('');
      expect(safeErrorMessage(error, 'カスタムエラー')).toBe('カスタムエラー');
    });
  });

  describe('production環境', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    test('内部エラーメッセージを隠蔽 → fallbackメッセージ', () => {
      const error = new Error('FATAL: password authentication failed for user "postgres"');
      expect(safeErrorMessage(error)).toBe('サーバーエラーが発生しました');
    });

    test('カスタムfallbackメッセージ', () => {
      const error = new Error('Internal detail');
      expect(safeErrorMessage(error, '処理に失敗しました')).toBe('処理に失敗しました');
    });

    test('error.messageがあっても常にfallback', () => {
      const error = new Error('SQL syntax error near...');
      expect(safeErrorMessage(error)).toBe('サーバーエラーが発生しました');
    });
  });

  describe('NODE_ENV未設定', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
    });

    test('未設定は本番扱い → fallbackメッセージ', () => {
      const error = new Error('Secret internal error');
      expect(safeErrorMessage(error)).toBe('サーバーエラーが発生しました');
    });
  });
});
