/**
 * フロントエンド入力バリデーションユーティリティ
 */

const FormValidator = {
  // メールアドレス正規表現
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // 電話番号正規表現（日本の電話番号）
  PHONE_REGEX: /^[\d\-\+\(\)\s]{10,15}$/,

  /**
   * バリデーションエラーをまとめて表示
   * @param {string[]} errors - エラーメッセージの配列
   * @returns {boolean} エラーがなければtrue
   */
  showErrors(errors) {
    if (errors.length === 0) return true;
    alert(errors.join('\n'));
    return false;
  },

  /**
   * 文字列の長さチェック
   */
  checkLength(value, fieldName, min, max) {
    const trimmed = (value || '').trim();
    if (min > 0 && trimmed.length === 0) {
      return `${fieldName}は必須です`;
    }
    if (trimmed.length < min) {
      return `${fieldName}は${min}文字以上で入力してください`;
    }
    if (max && trimmed.length > max) {
      return `${fieldName}は${max}文字以内で入力してください`;
    }
    return null;
  },

  /**
   * メールアドレスチェック
   */
  checkEmail(value, fieldName = 'メールアドレス', required = true) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return required ? `${fieldName}は必須です` : null;
    }
    if (!this.EMAIL_REGEX.test(trimmed)) {
      return `${fieldName}の形式が正しくありません`;
    }
    return null;
  },

  /**
   * 電話番号チェック
   */
  checkPhone(value, fieldName = '電話番号', required = false) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return required ? `${fieldName}は必須です` : null;
    }
    if (!this.PHONE_REGEX.test(trimmed)) {
      return `${fieldName}の形式が正しくありません（10〜15桁の数字・ハイフン）`;
    }
    return null;
  },

  /**
   * 数値チェック
   */
  checkNumber(value, fieldName, { required = true, min, max } = {}) {
    const num = parseFloat(value);
    if (required && (value === '' || value === null || value === undefined)) {
      return `${fieldName}は必須です`;
    }
    if (value !== '' && value !== null && value !== undefined) {
      if (isNaN(num)) {
        return `${fieldName}は数値で入力してください`;
      }
      if (min !== undefined && num < min) {
        return `${fieldName}は${min}以上で入力してください`;
      }
      if (max !== undefined && num > max) {
        return `${fieldName}は${max}以下で入力してください`;
      }
    }
    return null;
  },

  /**
   * 日付チェック（未来日チェック付き）
   */
  checkDate(value, fieldName, { required = true, allowFuture = false } = {}) {
    if (!value) {
      return required ? `${fieldName}は必須です` : null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return `${fieldName}の形式が正しくありません`;
    }
    if (!allowFuture) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (date > today) {
        return `${fieldName}に未来の日付は指定できません`;
      }
    }
    return null;
  },

  /**
   * パスワード強度チェック（8文字以上、英大小文字+数字）
   */
  checkPasswordStrength(value, fieldName = 'パスワード') {
    if (!value) {
      return `${fieldName}は必須です`;
    }
    if (value.length < 8) {
      return `${fieldName}は8文字以上で入力してください`;
    }
    if (!/[a-z]/.test(value)) {
      return `${fieldName}には小文字の英字を含めてください`;
    }
    if (!/[A-Z]/.test(value)) {
      return `${fieldName}には大文字の英字を含めてください`;
    }
    if (!/[0-9]/.test(value)) {
      return `${fieldName}には数字を含めてください`;
    }
    return null;
  },

  /**
   * セレクトボックスの選択チェック
   */
  checkSelect(value, fieldName) {
    if (!value) {
      return `${fieldName}を選択してください`;
    }
    return null;
  },

  // ===========================
  // フォーム別バリデーション
  // ===========================

  /**
   * 売上登録フォーム
   */
  validateCreateSale(data) {
    const errors = [];
    errors.push(this.checkSelect(data.agency_id, '代理店'));
    errors.push(this.checkSelect(data.product_id, '商品'));
    errors.push(this.checkNumber(data.quantity, '数量', { min: 1, max: 99999 }));
    errors.push(this.checkDate(data.sale_date, '売上日'));
    errors.push(this.checkLength(data.customer_name, '顧客名', 1, 100));
    errors.push(this.checkEmail(data.customer_email, '顧客メールアドレス', false));
    errors.push(this.checkPhone(data.customer_phone, '顧客電話番号', false));
    return this.showErrors(errors.filter(Boolean));
  },

  /**
   * 代理店登録フォーム
   */
  validateCreateAgency(data) {
    const errors = [];
    errors.push(this.checkLength(data.company_name, '会社名', 1, 100));
    errors.push(this.checkLength(data.representative_name, '代表者名', 1, 50));
    errors.push(this.checkEmail(data.contact_email, 'メールアドレス', true));
    errors.push(this.checkSelect(data.tier_level, '階層'));
    errors.push(this.checkPhone(data.contact_phone, '電話番号', false));
    return this.showErrors(errors.filter(Boolean));
  },

  /**
   * メールアドレス変更フォーム
   */
  validateChangeEmail(newEmail, password) {
    const errors = [];
    errors.push(this.checkEmail(newEmail, '新しいメールアドレス', true));
    errors.push(this.checkLength(password, 'パスワード（確認用）', 1, 200));
    return this.showErrors(errors.filter(Boolean));
  },

  /**
   * パスワード変更フォーム
   */
  validateChangePassword(currentPassword, newPassword, confirmPassword) {
    const errors = [];
    errors.push(this.checkLength(currentPassword, '現在のパスワード', 1, 200));
    const strengthError = this.checkPasswordStrength(newPassword, '新しいパスワード');
    if (strengthError) {
      errors.push(strengthError);
    }
    if (newPassword !== confirmPassword) {
      errors.push('新しいパスワードが一致しません');
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errors.push('新しいパスワードは現在のパスワードと異なるものにしてください');
    }
    return this.showErrors(errors.filter(Boolean));
  },

  /**
   * 商品登録/編集フォーム
   */
  validateProduct(data) {
    const errors = [];
    errors.push(this.checkLength(data.product_name, '商品名', 1, 100));
    errors.push(this.checkNumber(data.price, '価格', { min: 0, max: 999999999 }));
    errors.push(this.checkNumber(data.commission_rate_tier1, 'Tier1報酬率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.commission_rate_tier2, 'Tier2報酬率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.commission_rate_tier3, 'Tier3報酬率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.commission_rate_tier4, 'Tier4報酬率', { min: 0, max: 100 }));
    return this.showErrors(errors.filter(Boolean));
  },

  /**
   * 報酬設定フォーム
   */
  validateCommissionSettings(data) {
    const errors = [];
    errors.push(this.checkNumber(data.tier1_from_tier2_bonus, 'Tier1ボーナス率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.tier2_from_tier3_bonus, 'Tier2ボーナス率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.tier3_from_tier4_bonus, 'Tier3ボーナス率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.minimum_payment_amount, '最低支払額', { min: 0, max: 999999999 }));
    errors.push(this.checkNumber(data.payment_day, '支払日', { min: 1, max: 31 }));
    errors.push(this.checkNumber(data.closing_day, '締め日', { min: 1, max: 31 }));
    errors.push(this.checkNumber(data.withholding_tax_rate, '源泉徴収税率', { min: 0, max: 100 }));
    errors.push(this.checkNumber(data.non_invoice_deduction_rate, 'インボイス未登録控除率', { min: 0, max: 100 }));
    return this.showErrors(errors.filter(Boolean));
  }
};

// グローバルに公開
window.FormValidator = FormValidator;
