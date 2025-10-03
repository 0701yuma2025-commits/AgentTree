/**
 * フロントエンド用年齢確認ユーティリティ
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
      isValid: true, // 空の場合は許可（オプショナル）
      age: null,
      message: null
    };
  }

  const age = calculateAge(birthDate);

  if (age < 18) {
    return {
      isValid: false,
      age,
      message: `代表者は18歳以上である必要があります（現在${age}歳）`
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
 * 生年月日入力フィールドにリアルタイムバリデーションを追加
 * @param {HTMLInputElement} inputElement - 生年月日入力フィールド
 */
function attachAgeValidation(inputElement) {
  if (!inputElement) return;

  // エラーメッセージ表示用要素を作成
  const errorElement = document.createElement('small');
  errorElement.classList.add('age-error', 'text-danger');
  errorElement.style.display = 'none';
  inputElement.parentElement.appendChild(errorElement);

  // 年齢表示用要素を作成
  const ageDisplay = document.createElement('small');
  ageDisplay.classList.add('age-display', 'text-muted');
  ageDisplay.style.display = 'none';
  inputElement.parentElement.appendChild(ageDisplay);

  // バリデーション関数
  const validateInput = () => {
    const value = inputElement.value;
    if (!value) {
      errorElement.style.display = 'none';
      ageDisplay.style.display = 'none';
      inputElement.classList.remove('is-invalid');
      return true;
    }

    const validation = validateAge(value);

    if (!validation.isValid) {
      errorElement.textContent = validation.message;
      errorElement.style.display = 'block';
      ageDisplay.style.display = 'none';
      inputElement.classList.add('is-invalid');
      return false;
    } else {
      errorElement.style.display = 'none';
      if (validation.age !== null) {
        ageDisplay.textContent = `${validation.age}歳`;
        ageDisplay.style.display = 'block';
      }
      inputElement.classList.remove('is-invalid');
      return true;
    }
  };

  // イベントリスナーを追加
  inputElement.addEventListener('change', validateInput);
  inputElement.addEventListener('blur', validateInput);

  return validateInput;
}

// グローバルに公開
window.ageValidator = {
  calculateAge,
  validateAge,
  attachAgeValidation
};