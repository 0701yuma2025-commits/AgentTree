/**
 * CSV数式インジェクション防止ユーティリティ テスト
 */

const { sanitizeCsvValue, sanitizeCsvRow } = require('../csvSanitizer');

// ══════════════════════════════════════════════════════════
// sanitizeCsvValue
// ══════════════════════════════════════════════════════════
describe('sanitizeCsvValue', () => {
  describe('数式プレフィックスのエスケープ', () => {
    test('= で始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    });

    test('+ で始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('+cmd|ls')).toBe("'+cmd|ls");
    });

    test('- で始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('-1+1')).toBe("'-1+1");
    });

    test('@ で始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    test('タブ文字で始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('\tcmd')).toBe("'\tcmd");
    });

    test('キャリッジリターンで始まる → シングルクォート付加', () => {
      expect(sanitizeCsvValue('\rcmd')).toBe("'\rcmd");
    });
  });

  describe('安全な値はそのまま返す', () => {
    test('通常の文字列', () => {
      expect(sanitizeCsvValue('テスト代理店')).toBe('テスト代理店');
    });

    test('数字で始まる文字列', () => {
      expect(sanitizeCsvValue('123abc')).toBe('123abc');
    });

    test('空文字', () => {
      expect(sanitizeCsvValue('')).toBe('');
    });
  });

  describe('null/undefined処理', () => {
    test('null → 空文字', () => {
      expect(sanitizeCsvValue(null)).toBe('');
    });

    test('undefined → 空文字', () => {
      expect(sanitizeCsvValue(undefined)).toBe('');
    });
  });

  describe('非文字列の型変換', () => {
    test('数値 → 文字列化', () => {
      expect(sanitizeCsvValue(12345)).toBe('12345');
    });

    test('boolean → 文字列化', () => {
      expect(sanitizeCsvValue(true)).toBe('true');
    });

    test('負の数値（-始まり） → エスケープ', () => {
      expect(sanitizeCsvValue(-500)).toBe("'-500");
    });
  });
});

// ══════════════════════════════════════════════════════════
// sanitizeCsvRow
// ══════════════════════════════════════════════════════════
describe('sanitizeCsvRow', () => {
  test('文字列フィールドのみサニタイズ', () => {
    const row = {
      name: '=malicious',
      amount: 10000,
      active: true,
    };
    const result = sanitizeCsvRow(row);
    expect(result.name).toBe("'=malicious");
    expect(result.amount).toBe(10000);
    expect(result.active).toBe(true);
  });

  test('安全な文字列はそのまま', () => {
    const row = { company: 'テスト株式会社', code: 'AGN20260001' };
    const result = sanitizeCsvRow(row);
    expect(result.company).toBe('テスト株式会社');
    expect(result.code).toBe('AGN20260001');
  });

  test('空オブジェクト → 空オブジェクト', () => {
    expect(sanitizeCsvRow({})).toEqual({});
  });

  test('複数の危険フィールドを一括サニタイズ', () => {
    const row = {
      field1: '=cmd',
      field2: '+exec',
      field3: '@import',
      safe: 'OK',
    };
    const result = sanitizeCsvRow(row);
    expect(result.field1).toBe("'=cmd");
    expect(result.field2).toBe("'+exec");
    expect(result.field3).toBe("'@import");
    expect(result.safe).toBe('OK');
  });
});
