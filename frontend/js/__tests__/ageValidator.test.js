/**
 * フロントエンド年齢バリデーション テスト
 */

// グローバルにwindowを模倣してモジュールを読み込み
const fs = require('fs');
const path = require('path');

// ageValidator.jsを読み込むためにevalで実行（CommonJSモジュールではないため）
const code = fs.readFileSync(path.resolve(__dirname, '../utils/ageValidator.js'), 'utf-8');
const mockWindow = {};
const fn = new Function('window', 'document', code);
fn(mockWindow, { createElement: () => ({ classList: { add: () => {} }, style: {} }) });

const { calculateAge, validateAge } = mockWindow.ageValidator;

// ═══════════════════════════════════════════════
// calculateAge
// ═══════════════════════════════════════════════
describe('calculateAge', () => {
  test('誕生日前 → 年齢が1歳少ない', () => {
    const today = new Date();
    const futureMonth = today.getMonth() + 2; // 来月以降の誕生日
    const birth = new Date(today.getFullYear() - 25, futureMonth, 15);
    const age = calculateAge(birth.toISOString().split('T')[0]);
    expect(age).toBe(24);
  });

  test('誕生日を過ぎている → 正しい年齢', () => {
    const today = new Date();
    const pastMonth = today.getMonth() - 2; // 2ヶ月前
    const birth = new Date(today.getFullYear() - 30, pastMonth, 1);
    const age = calculateAge(birth.toISOString().split('T')[0]);
    expect(age).toBe(30);
  });

  test('今日が誕生日 → 正しい年齢', () => {
    const today = new Date();
    const birth = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate());
    const age = calculateAge(birth.toISOString().split('T')[0]);
    expect(age).toBe(20);
  });

  test('1歳 → 1', () => {
    const today = new Date();
    const birth = new Date(today.getFullYear() - 1, today.getMonth() - 1, 1);
    const age = calculateAge(birth.toISOString().split('T')[0]);
    expect(age).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// validateAge
// ═══════════════════════════════════════════════
describe('validateAge', () => {
  test('空文字 → isValid=true（オプショナル）', () => {
    const result = validateAge('');
    expect(result.isValid).toBe(true);
    expect(result.age).toBeNull();
  });

  test('null → isValid=true', () => {
    const result = validateAge(null);
    expect(result.isValid).toBe(true);
  });

  test('18歳未満 → isValid=false', () => {
    const today = new Date();
    const birth = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());
    const result = validateAge(birth.toISOString().split('T')[0]);
    expect(result.isValid).toBe(false);
    expect(result.age).toBe(15);
    expect(result.message).toContain('18歳以上');
  });

  test('ちょうど18歳 → isValid=true', () => {
    const today = new Date();
    const birth = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const result = validateAge(birth.toISOString().split('T')[0]);
    expect(result.isValid).toBe(true);
    expect(result.age).toBe(18);
  });

  test('120歳超 → isValid=false', () => {
    const result = validateAge('1800-01-01');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('正しくありません');
  });

  test('正常な年齢（30歳） → isValid=true', () => {
    const today = new Date();
    const birth = new Date(today.getFullYear() - 30, 0, 15);
    const result = validateAge(birth.toISOString().split('T')[0]);
    expect(result.isValid).toBe(true);
    expect(result.age).toBe(30);
    expect(result.message).toBeNull();
  });
});
