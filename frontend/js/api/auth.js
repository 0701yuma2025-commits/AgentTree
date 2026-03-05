/**
 * 認証API
 */

class AuthAPI {
  /**
   * ログイン
   */
  async login(email, password, rememberMe = false) {
    try {
      // バックエンドAPIを使用してログイン（正しいroleを取得するため）
      const response = await apiClient.post('/auth/login', {
        email,
        password,
        remember_me: rememberMe
      });

      if (response.success) {
        // remember_me: trueならlocalStorage、falseならsessionStorage（ブラウザ閉じたら消える）
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(response.user));
        // remember_meの状態も保存（他の箇所で参照するため）
        localStorage.setItem('agency_system_remember_me', rememberMe ? 'true' : 'false');
        return response;
      }

      throw new Error(response.message || 'ログインに失敗しました');
    } catch (error) {
      errorLog('Login error:', error);
      throw error;
    }
  }

  /**
   * ログアウト
   */
  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      // エラーでもローカルはクリア
    } finally {
      this.clearSession();
    }
  }

  /**
   * セッションクリア
   */
  clearSession() {
    // localStorageを完全クリア（他ユーザーのデータを確実に削除）
    localStorage.clear();
    // sessionStorageもクリア
    sessionStorage.clear();
  }

  /**
   * 現在のユーザー取得
   */
  getCurrentUser() {
    const userStr = localStorage.getItem(CONFIG.STORAGE_KEYS.USER)
      || sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * ログイン状態チェック
   */
  isLoggedIn() {
    // トークンはhttpOnly Cookieで管理されるため、ユーザー情報の有無で判定
    return !!this.getCurrentUser();
  }

  /**
   * 管理者チェック
   */
  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  }

  /**
   * トークンリフレッシュ
   */
  async refreshToken() {
    try {
      // refresh_tokenはhttpOnly Cookieで自動送信される
      const response = await apiClient.post('/auth/refresh', {});

      if (response.success) {
        return response;
      }

      throw new Error('トークンリフレッシュに失敗しました');
    } catch (error) {
      errorLog('Token refresh error:', error);
      this.clearSession();
      throw error;
    }
  }

  /**
   * ============================================
   * 2段階認証（メール方式のみ）
   * ============================================
   */

  /**
   * 2FAステータス確認
   */
  async get2FAStatus() {
    try {
      const response = await apiClient.get('/auth/2fa/status');
      return response;
    } catch (error) {
      errorLog('2FA status error:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * メール2段階認証API
   * ============================================
   */

  /**
   * メール2FA有効化（パスワード確認のみ）
   */
  async enable2FAEmail(password) {
    try {
      const response = await apiClient.post('/auth/2fa/email/enable', { password });
      return response;
    } catch (error) {
      errorLog('Enable 2FA email error:', error);
      throw error;
    }
  }

  /**
   * メール2FA認証コード検証
   */
  async verify2FAEmail(code) {
    try {
      const response = await apiClient.post('/auth/2fa/email/verify', { code });
      return response;
    } catch (error) {
      errorLog('Verify 2FA email error:', error);
      throw error;
    }
  }

  /**
   * メール2FA無効化リクエスト（認証コードをメール送信）
   */
  async requestDisable2FACode() {
    try {
      const response = await apiClient.post('/auth/2fa/email/disable/request');
      return response;
    } catch (error) {
      errorLog('Request disable 2FA code error:', error);
      throw error;
    }
  }

  /**
   * メール2FA無効化検証（認証コードで無効化）
   */
  async verifyDisable2FACode(code) {
    try {
      const response = await apiClient.post('/auth/2fa/email/disable/verify', { code });
      return response;
    } catch (error) {
      errorLog('Verify disable 2FA code error:', error);
      throw error;
    }
  }

  /**
   * ログイン時のメール2FA検証
   */
  async login2FAEmail(email, code) {
    try {
      const response = await apiClient.post('/auth/login/2fa/email', {
        email,
        code
      });

      if (response.success) {
        // remember_meの状態に応じて保存先を分岐
        const rememberMe = localStorage.getItem('agency_system_remember_me') === 'true';
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(response.user));
        return response;
      }

      throw new Error(response.message || 'メール2FA認証に失敗しました');
    } catch (error) {
      errorLog('2FA email login error:', error);
      throw error;
    }
  }
}

const authAPI = new AuthAPI();

// グローバルに公開
window.authAPI = authAPI;