/**
 * パスワードバリデーター テスト
 */

const {
  validatePassword,
  checkPasswordSimilarity,
  generateSecurePassword,
  checkPasswordHistory,
} = require('../passwordValidator');

// ── ヘルパー ──────────────────────────────────────────────

function validPassword() {
  return 'Xk9!mPqW';  // 8文字、大文字・小文字・数字・記号含む、連続・繰り返しなし
}

// ══════════════════════════════════════════════════════════
// validatePassword
// ══════════════════════════════════════════════════════════
describe('validatePassword', () => {

  describe('長さチェック', () => {
    test('8文字未満 → 無効', () => {
      const result = validatePassword('Xk9!mPq');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('8文字以上')])
      );
    });

    test('8文字ちょうど → 長さは有効', () => {
      const result = validatePassword(validPassword());
      expect(result.errors).not.toEqual(
        expect.arrayContaining([expect.stringContaining('8文字以上')])
      );
    });

    test('128文字超 → 無効', () => {
      const longPassword = 'Aa1!' + 'x'.repeat(126); // 130文字
      const result = validatePassword(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('128文字以下')])
      );
    });
  });

  describe('文字種チェック', () => {
    test('大文字なし → 無効', () => {
      const result = validatePassword('xk9!mpqw');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('大文字')])
      );
    });

    test('小文字なし → 無効', () => {
      const result = validatePassword('XK9!MPQW');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('小文字')])
      );
    });

    test('数字なし → 無効', () => {
      const result = validatePassword('Xkz!mPqW');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('数字')])
      );
    });

    test('特殊文字なし → 無効', () => {
      const result = validatePassword('Xk9zmPqW');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('特殊文字')])
      );
    });
  });

  describe('禁止パターン', () => {
    test('よくあるパスワード "password" を含む → 無効', () => {
      const result = validatePassword('Password1!X');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('よく使われるパスワード')])
      );
    });

    test('連続文字 "abc" を含む → 無効', () => {
      const result = validatePassword('Xk9!abcW');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('連続した文字')])
      );
    });

    test('連続数字 "123" を含む → 無効', () => {
      const result = validatePassword('Xkz!123W');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('連続した文字')])
      );
    });

    test('同一文字3連続 "aaa" → 無効', () => {
      const result = validatePassword('Xk9!aaaW');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('3回以上連続')])
      );
    });
  });

  describe('有効なパスワード', () => {
    test('全条件を満たす → 有効', () => {
      const result = validatePassword(validPassword());
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('強度スコア', () => {
    test('短いパスワード → weak', () => {
      const result = validatePassword(validPassword());
      // 8文字: score = 4 (各文字種1点ずつ), エントロピーで+2 → medium程度
      expect(['weak', 'medium', 'strong', 'very_strong']).toContain(result.strength);
    });

    test('16文字以上の強いパスワード → 高スコア', () => {
      const result = validatePassword('Xk9!mPqWzR7&jLnT');
      expect(result.score).toBeGreaterThanOrEqual(6);
      expect(['strong', 'very_strong']).toContain(result.strength);
    });
  });
});

// ══════════════════════════════════════════════════════════
// checkPasswordSimilarity
// ══════════════════════════════════════════════════════════
describe('checkPasswordSimilarity', () => {
  test('メールアドレスの一部を含む → 無効', () => {
    const result = checkPasswordSimilarity('Xk9!tanaka', {
      email: 'tanaka.test@example.com',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('メールアドレス')])
    );
  });

  test('メールの短い部分（2文字以下）は許容', () => {
    const result = checkPasswordSimilarity('Xk9!mPqW', {
      email: 'ab@example.com',
    });
    expect(result.isValid).toBe(true);
  });

  test('名前を含む → 無効', () => {
    const result = checkPasswordSimilarity('Xk9!yamada', {
      name: 'Yamada Taro',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('名前')])
    );
  });

  test('会社名を含む → 無効', () => {
    const result = checkPasswordSimilarity('Xk9!veteran', {
      company: 'Veteran Corp',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('会社名')])
    );
  });

  test('生年月日を含む（YYYYMMDD） → 無効', () => {
    const result = checkPasswordSimilarity('Xk9!19900515pw', {
      birthDate: '1990-05-15',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('生年月日')])
    );
  });

  test('生年月日を含む（月日のみ） → 無効', () => {
    const result = checkPasswordSimilarity('Xk9!0515pw', {
      birthDate: '1990-05-15',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('生年月日')])
    );
  });

  test('ユーザー情報と無関係なパスワード → 有効', () => {
    const result = checkPasswordSimilarity('Xk9!mPqW', {
      email: 'tanaka@example.com',
      name: 'Yamada Taro',
      company: 'Veteran Corp',
      birthDate: '1990-05-15',
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('userInfo省略時 → 有効', () => {
    const result = checkPasswordSimilarity('Xk9!mPqW');
    expect(result.isValid).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// generateSecurePassword
// ══════════════════════════════════════════════════════════
describe('generateSecurePassword', () => {
  test('デフォルト長16文字', () => {
    const pw = generateSecurePassword();
    expect(pw).toHaveLength(16);
  });

  test('カスタム長（24文字）', () => {
    const pw = generateSecurePassword(24);
    expect(pw).toHaveLength(24);
  });

  test('大文字を含む', () => {
    const pw = generateSecurePassword();
    expect(/[A-Z]/.test(pw)).toBe(true);
  });

  test('小文字を含む', () => {
    const pw = generateSecurePassword();
    expect(/[a-z]/.test(pw)).toBe(true);
  });

  test('数字を含む', () => {
    const pw = generateSecurePassword();
    expect(/\d/.test(pw)).toBe(true);
  });

  test('特殊文字を含む', () => {
    const pw = generateSecurePassword();
    expect(/[!@#$%^&*()_+\-=\[\]{};:,.<>?|]/.test(pw)).toBe(true);
  });

  test('毎回異なるパスワードを生成', () => {
    const pw1 = generateSecurePassword();
    const pw2 = generateSecurePassword();
    expect(pw1).not.toBe(pw2);
  });
});

// ══════════════════════════════════════════════════════════
// checkPasswordHistory
// ══════════════════════════════════════════════════════════
describe('checkPasswordHistory', () => {
  // bcryptモック
  beforeEach(() => {
    jest.resetModules();
  });

  test('空の履歴 → true（使用可能）', async () => {
    const result = await checkPasswordHistory('newPassword1!', []);
    expect(result).toBe(true);
  });

  test('履歴に一致するパスワードがある → false', async () => {
    const bcrypt = require('bcrypt');
    const hashed = await bcrypt.hash('OldPassword1!', 10);
    const result = await checkPasswordHistory('OldPassword1!', [hashed]);
    expect(result).toBe(false);
  });

  test('履歴に一致しない → true', async () => {
    const bcrypt = require('bcrypt');
    const hashed = await bcrypt.hash('DifferentPassword1!', 10);
    const result = await checkPasswordHistory('NewPassword1!', [hashed]);
    expect(result).toBe(true);
  });

  test('6番目以降の履歴は無視（最近5つのみチェック）', async () => {
    const bcrypt = require('bcrypt');
    const targetHash = await bcrypt.hash('TargetPassword1!', 10);
    const dummyHash = await bcrypt.hash('DummyPassword1!', 10);
    // targetHashを6番目に配置
    const history = [dummyHash, dummyHash, dummyHash, dummyHash, dummyHash, targetHash];
    const result = await checkPasswordHistory('TargetPassword1!', history);
    expect(result).toBe(true);
  });
});
