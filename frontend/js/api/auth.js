/**
 * 認証API
 */

class AuthAPI {
  /**
   * ログイン
   */
  async login(email, password) {
    try {
      // バックエンドAPIを使用してログイン（正しいroleを取得するため）
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });

      if (response.success) {
        apiClient.setToken(response.token);
        localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(response.user));
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
    const userStr = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * ログイン状態チェック
   */
  isLoggedIn() {
    return !!apiClient.getToken() && !!this.getCurrentUser();
  }

  /**
   * 管理者チェック
   */
  isAdmin() {
    const user = this.getCurrentUser();
    return user && (user.role === 'admin' || user.role === 'super_admin');
  }

  /**
   * トークンリフレッシュ
   */
  async refreshToken() {
    try {
      const refreshToken = localStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new Error('リフレッシュトークンがありません');
      }

      const response = await apiClient.post('/auth/refresh', {
        refreshToken
      });

      if (response.success) {
        apiClient.setToken(response.token);
        if (response.refreshToken) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, response.refreshToken);
        }
        return response;
      }

      throw new Error('トークンリフレッシュに失敗しました');
    } catch (error) {
      errorLog('Token refresh error:', error);
      this.clearSession();
      throw error;
    }
  }
}

const authAPI = new AuthAPI();

// グローバルに公開
window.authAPI = authAPI;