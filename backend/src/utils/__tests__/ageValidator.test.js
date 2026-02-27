/**
 * 年齢バリデーター テスト
 */

const {
  calculateAge,
  validateAge,
  validateDateFormat,
} = require('../ageValidator');

// ══════════════════════════════════════════════════════════
// calculateAge
// ══════════════════════════════════════════════════════════
describe('calculateAge', () => {
  // 日付を固定してテストの安定性を確保
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-27'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('誕生日前（今年の誕生日がまだ来ていない） → 年齢-1', () => {
    // 2000-06-15 → 2026-02-27時点で25歳（6月がまだ来ていない）
    expect(calculateAge('2000-06-15')).toBe(25);
  });

  test('誕生日後（今年の誕生日が過ぎている） → 正確な年齢', () => {
    // 2000-01-10 → 2026-02-27時点で26歳（1月は過ぎている）
    expect(calculateAge('2000-01-10')).toBe(26);
  });

  test('誕生日当日 → 正確な年齢', () => {
    // 2000-02-27 → 2026-02-27時点で26歳
    expect(calculateAge('2000-02-27')).toBe(26);
  });

  test('誕生日が今月だが日が来ていない → 年齢-1', () => {
    // 2000-02-28 → 2026-02-27時点で25歳（28日がまだ来ていない）
    expect(calculateAge('2000-02-28')).toBe(25);
  });

  test('今年の1月1日生まれ → 0歳', () => {
    expect(calculateAge('2026-01-01')).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// validateAge
// ══════════════════════════════════════════════════════════
describe('validateAge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-27'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('生年月日なし → 無効', () => {
    const result = validateAge(null);
    expect(result.isValid).toBe(false);
    expect(result.age).toBeNull();
    expect(result.message).toContain('入力されていません');
  });

  test('空文字 → 無効', () => {
    const result = validateAge('');
    expect(result.isValid).toBe(false);
  });

  test('18歳未満（17歳） → 無効', () => {
    // 2009-02-27 → 17歳
    const result = validateAge('2009-02-28');
    expect(result.isValid).toBe(false);
    expect(result.age).toBe(16);
    expect(result.message).toContain('18歳未満');
  });

  test('ちょうど18歳 → 有効', () => {
    // 2008-02-27 → 18歳
    const result = validateAge('2008-02-27');
    expect(result.isValid).toBe(true);
    expect(result.age).toBe(18);
    expect(result.message).toBeNull();
  });

  test('120歳超 → 無効', () => {
    // 1900-01-01 → 126歳
    const result = validateAge('1900-01-01');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('正しくありません');
  });

  test('正常範囲（30歳） → 有効', () => {
    const result = validateAge('1996-01-15');
    expect(result.isValid).toBe(true);
    expect(result.age).toBe(30);
  });

  test('65歳 → 有効', () => {
    const result = validateAge('1961-01-01');
    expect(result.isValid).toBe(true);
    expect(result.age).toBe(65);
  });
});

// ══════════════════════════════════════════════════════════
// validateDateFormat
// ══════════════════════════════════════════════════════════
describe('validateDateFormat', () => {
  test('正常フォーマット YYYY-MM-DD → true', () => {
    expect(validateDateFormat('2000-06-15')).toBe(true);
  });

  test('null → false', () => {
    expect(validateDateFormat(null)).toBe(false);
  });

  test('空文字 → false', () => {
    expect(validateDateFormat('')).toBe(false);
  });

  test('スラッシュ区切り → false', () => {
    expect(validateDateFormat('2000/06/15')).toBe(false);
  });

  test('日本語形式 → false', () => {
    expect(validateDateFormat('2000年06月15日')).toBe(false);
  });

  test('MM-DD-YYYY → false', () => {
    expect(validateDateFormat('06-15-2000')).toBe(false);
  });

  test('存在しない日付 2月30日 → JSのDate自動補正によりtrue（既知の制限）', () => {
    // new Date('2000-02-30') はJSが3月1日に自動補正するためNaNにならない
    expect(validateDateFormat('2000-02-30')).toBe(true);
  });

  test('完全に無効な日付 → false', () => {
    expect(validateDateFormat('0000-00-00')).toBe(false);
  });

  test('年が4桁でない → false', () => {
    expect(validateDateFormat('00-06-15')).toBe(false);
  });
});
