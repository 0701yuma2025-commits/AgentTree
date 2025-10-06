/**
 * パスワードバリデーター
 * 本番環境向け強化パスワードポリシー
 */

/**
 * パスワード強度の検証
 * @param {string} password - 検証するパスワード
 * @returns {object} 検証結果
 */
function validatePassword(password) {
  const result = {
    isValid: true,
    errors: [],
    strength: 'weak',
    score: 0
  };

  // 基本要件
  const requirements = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: true,
    prohibitCommonPasswords: true,
    prohibitSequential: true,
    prohibitRepeating: true
  };

  // 長さチェック
  if (password.length < requirements.minLength) {
    result.isValid = false;
    result.errors.push(`パスワードは${requirements.minLength}文字以上である必要があります`);
  }

  if (password.length > requirements.maxLength) {
    result.isValid = false;
    result.errors.push(`パスワードは${requirements.maxLength}文字以下である必要があります`);
  }

  // 大文字チェック
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    result.isValid = false;
    result.errors.push('大文字を1文字以上含む必要があります');
  } else if (requirements.requireUppercase) {
    result.score += 1;
  }

  // 小文字チェック
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    result.isValid = false;
    result.errors.push('小文字を1文字以上含む必要があります');
  } else if (requirements.requireLowercase) {
    result.score += 1;
  }

  // 数字チェック
  if (requirements.requireNumber && !/\d/.test(password)) {
    result.isValid = false;
    result.errors.push('数字を1文字以上含む必要があります');
  } else if (requirements.requireNumber) {
    result.score += 1;
  }

  // 特殊文字チェック
  const specialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
  if (requirements.requireSpecialChar && !specialChars.test(password)) {
    result.isValid = false;
    result.errors.push('特殊文字(!@#$%^&*など)を1文字以上含む必要があります');
  } else if (requirements.requireSpecialChar) {
    result.score += 1;
  }

  // よくあるパスワードのチェック
  const commonPasswords = [
    'password', 'Password', 'password123', 'Password123',
    'admin', 'Admin', 'admin123', 'Admin123',
    'qwerty', 'Qwerty', 'qwerty123', 'Qwerty123',
    '12345678', '123456789', '1234567890',
    'abcdefgh', 'Abcdefgh', 'abcd1234', 'Abcd1234',
    'password!', 'Password!', 'Admin!', 'admin!',
    'welcome', 'Welcome', 'welcome123', 'Welcome123',
    'letmein', 'Letmein', 'monkey', 'Monkey',
    'dragon', 'Dragon', 'master', 'Master'
  ];

  if (requirements.prohibitCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    for (const common of commonPasswords) {
      if (lowerPassword.includes(common.toLowerCase())) {
        result.isValid = false;
        result.errors.push('よく使われるパスワードは使用できません');
        result.score -= 2;
        break;
      }
    }
  }

  // 連続文字のチェック（例：abc, 123）
  if (requirements.prohibitSequential) {
    const hasSequential = /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789/i.test(password);
    if (hasSequential) {
      result.isValid = false;
      result.errors.push('連続した文字や数字（abc、123など）は使用できません');
      result.score -= 1;
    }
  }

  // 同じ文字の繰り返しチェック（例：aaa, 111）
  if (requirements.prohibitRepeating) {
    const hasRepeating = /(.)\1{2,}/.test(password);
    if (hasRepeating) {
      result.isValid = false;
      result.errors.push('同じ文字を3回以上連続で使用することはできません');
      result.score -= 1;
    }
  }

  // パスワード強度の判定
  if (password.length >= 12) result.score += 2;
  if (password.length >= 16) result.score += 2;

  // エントロピーの計算（簡易版）
  const charsetSize =
    (/[a-z]/.test(password) ? 26 : 0) +
    (/[A-Z]/.test(password) ? 26 : 0) +
    (/\d/.test(password) ? 10 : 0) +
    (specialChars.test(password) ? 32 : 0);

  const entropy = password.length * Math.log2(charsetSize);

  if (entropy >= 60) result.score += 2;
  if (entropy >= 80) result.score += 2;

  // 最終的な強度判定
  if (result.score >= 8) {
    result.strength = 'very_strong';
  } else if (result.score >= 6) {
    result.strength = 'strong';
  } else if (result.score >= 4) {
    result.strength = 'medium';
  } else {
    result.strength = 'weak';
  }

  return result;
}

/**
 * パスワードと他のユーザー情報との類似性チェック
 * @param {string} password - パスワード
 * @param {object} userInfo - ユーザー情報
 * @returns {object} 検証結果
 */
function checkPasswordSimilarity(password, userInfo = {}) {
  const result = {
    isValid: true,
    errors: []
  };

  const lowerPassword = password.toLowerCase();

  // メールアドレスとの類似性チェック
  if (userInfo.email) {
    const emailParts = userInfo.email.toLowerCase().split('@')[0].split(/[._-]/);
    for (const part of emailParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        result.isValid = false;
        result.errors.push('パスワードにメールアドレスの一部を含めることはできません');
        break;
      }
    }
  }

  // 名前との類似性チェック
  if (userInfo.name) {
    const nameParts = userInfo.name.toLowerCase().split(/\s+/);
    for (const part of nameParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        result.isValid = false;
        result.errors.push('パスワードに名前を含めることはできません');
        break;
      }
    }
  }

  // 会社名との類似性チェック
  if (userInfo.company) {
    const companyParts = userInfo.company.toLowerCase().split(/\s+/);
    for (const part of companyParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        result.isValid = false;
        result.errors.push('パスワードに会社名を含めることはできません');
        break;
      }
    }
  }

  // 生年月日との類似性チェック
  if (userInfo.birthDate) {
    const datePatterns = [
      userInfo.birthDate.replace(/-/g, ''),
      userInfo.birthDate.split('-')[0], // 年
      userInfo.birthDate.split('-')[1] + userInfo.birthDate.split('-')[2], // 月日
    ];

    for (const pattern of datePatterns) {
      if (pattern && lowerPassword.includes(pattern)) {
        result.isValid = false;
        result.errors.push('パスワードに生年月日を含めることはできません');
        break;
      }
    }
  }

  return result;
}

/**
 * パスワード生成
 * セキュアなランダムパスワードを生成
 * @param {number} length - パスワードの長さ
 * @returns {string} 生成されたパスワード
 */
function generateSecurePassword(length = 16) {
  const crypto = require('crypto');

  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + special;

  let password = '';

  // 各種類から最低1文字を含める
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  // 残りの文字をランダムに追加
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // パスワードをシャッフル
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

/**
 * パスワード履歴チェック
 * @param {string} newPassword - 新しいパスワード
 * @param {array} passwordHistory - パスワード履歴（ハッシュ化済み）
 * @returns {boolean} 履歴に含まれていない場合true
 */
async function checkPasswordHistory(newPassword, passwordHistory = []) {
  const bcrypt = require('bcrypt');

  // 最近の5つのパスワードをチェック
  const recentPasswords = passwordHistory.slice(0, 5);

  for (const hashedPassword of recentPasswords) {
    const isMatch = await bcrypt.compare(newPassword, hashedPassword);
    if (isMatch) {
      return false;
    }
  }

  return true;
}

module.exports = {
  validatePassword,
  checkPasswordSimilarity,
  generateSecurePassword,
  checkPasswordHistory
};