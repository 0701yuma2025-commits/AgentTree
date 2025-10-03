/**
 * 招待承認ページ
 */

class InviteAccept {
  constructor() {
    this.inviteToken = null;
    this.inviteData = null;
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    // URLパラメータからトークン取得
    const urlParams = new URLSearchParams(window.location.search);
    this.inviteToken = urlParams.get('token');

    if (!this.inviteToken) {
      this.showExpired();
      return;
    }

    // トークン検証
    await this.validateToken();

    // フォーム送信イベント
    document.getElementById('registrationForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  /**
   * トークン検証
   */
  async validateToken() {
    try {
      const response = await apiClient.get(`/invitations/validate?token=${this.inviteToken}`);
      
      if (response.success && response.data) {
        this.inviteData = response.data;
        this.showRegistrationForm();
      } else {
        this.showExpired();
      }
    } catch (error) {
      errorLog('Token validation error:', error);
      this.showExpired();
    }
  }

  /**
   * 登録フォーム表示
   */
  showRegistrationForm() {
    document.getElementById('inviteLoading').style.display = 'none';
    document.getElementById('registrationForm').style.display = 'block';
    
    // 招待メールアドレスを設定
    if (this.inviteData.email) {
      document.getElementById('email').value = this.inviteData.email;
    }
  }

  /**
   * 期限切れ表示
   */
  showExpired() {
    document.getElementById('inviteLoading').style.display = 'none';
    document.getElementById('registrationForm').style.display = 'none';
    document.getElementById('inviteExpired').style.display = 'block';
  }

  /**
   * フォーム送信処理
   */
  async handleSubmit() {
    // バリデーション
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('passwordConfirm').value;

    if (password !== passwordConfirm) {
      this.showMessage('パスワードが一致しません', 'error');
      return;
    }

    if (!this.validatePassword(password)) {
      this.showMessage('パスワードは英数字を含む8文字以上で入力してください', 'error');
      return;
    }

    const terms = document.getElementById('terms').checked;
    if (!terms) {
      this.showMessage('利用規約に同意してください', 'error');
      return;
    }

    // 登録データ作成
    const registrationData = {
      token: this.inviteToken,
      company_name: document.getElementById('companyName').value,
      representative_name: document.getElementById('representativeName').value,
      email: document.getElementById('email').value,
      password: password,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value
    };

    try {
      this.showMessage('登録処理中...', 'info');

      const response = await apiClient.post('/invitations/accept', registrationData);

      if (response.success) {
        this.showMessage('登録が完了しました。ログインページに移動します...', 'success');
        
        // 3秒後にログインページへリダイレクト
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    } catch (error) {
      this.showMessage(error.message || '登録に失敗しました', 'error');
    }
  }

  /**
   * パスワードバリデーション
   */
  validatePassword(password) {
    // 8文字以上、英字と数字を含む
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasMinLength = password.length >= 8;
    
    return hasLetter && hasNumber && hasMinLength;
  }

  /**
   * メッセージ表示
   */
  showMessage(message, type = 'info') {
    const element = document.getElementById('inviteMessage');
    if (element) {
      element.textContent = message;
      element.className = `message ${type}`;
      element.style.display = 'block';

      if (type === 'success') {
        // 成功メッセージは持続表示
      } else if (type === 'error') {
        // エラーメッセージは5秒後に消去
        setTimeout(() => {
          element.style.display = 'none';
        }, 5000);
      }
    }
  }
}

// ページ起動
const inviteAccept = new InviteAccept();