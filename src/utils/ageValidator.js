/**
 * 年齢確認ユーティリティ
 */

/**
 * 生年月日から年齢を計算
 * @param {string} birthDate - 生年月日 (YYYY-MM-DD形式)
 * @returns {number} 年齢
 */
function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * 18歳以上かどうかを確認
 * @param {string} birthDate - 生年月日 (YYYY-MM-DD形式)
 * @returns {object} 確認結果
 */
function validateAge(birthDate) {
  if (!birthDate) {
    return {
      isValid: false,
      age: null,
      message: '生年月日が入力されていません'
    };
  }

  const age = calculateAge(birthDate);

  if (age < 18) {
    return {
      isValid: false,
      age,
      message: `18歳未満のため登録できません（現在${age}歳）`
    };
  }

  if (age > 120) {
    return {
      isValid: false,
      age,
      message: '生年月日が正しくありません'
    };
  }

  return {
    isValid: true,
    age,
    message: null
  };
}

/**
 * 生年月日の形式をバリデート
 * @param {string} birthDate - 生年月日
 * @returns {boolean} 形式が正しいか
 */
function validateDateFormat(birthDate) {
  if (!birthDate) return false;

  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(birthDate)) return false;

  const date = new Date(birthDate);
  return date instanceof Date && !isNaN(date);
}

module.exports = {
  calculateAge,
  validateAge,
  validateDateFormat
};