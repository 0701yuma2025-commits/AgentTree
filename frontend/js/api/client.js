/**
 * APIクライアント
 */

class ApiClient {
  constructor() {
    this.baseURL = CONFIG.API_BASE_URL;
  }

  /**
   * HTTPリクエスト送信
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    // デフォルトヘッダー
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // 認証トークンがあれば追加
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store'  // ブラウザキャッシュを完全に無効化
      });

      // 認証エラーの場合の処理
      if (response.status === 401 || response.status === 403) {
        const data = await response.json();

        // JWT関連のエラーをチェック
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN' ||
            data.code === 'TOKEN_NOT_ACTIVE' || data.code === 'TOKEN_VERIFICATION_FAILED') {
          console.log('JWT認証エラーを検知しました。ログイン画面へ移動します。');
          console.log('エラー詳細:', data.message);
          this.removeToken();

          // ユーザーに通知
          if (data.code === 'TOKEN_EXPIRED') {
            alert('セッションの有効期限が切れました。再度ログインしてください。');
          } else {
            alert('認証に問題が発生しました。再度ログインしてください。');
          }

          // ログイン画面へリダイレクト
          window.location.href = '/';
          return;
        }

        // その他の403エラーの場合
        console.error('アクセス権限エラー:', data.message || 'アクセスが拒否されました');
        return {
          success: false,
          message: data.message || 'アクセスが拒否されました',
          error: data.error,
          code: data.code
        };
      }

      // レスポンスの処理
      const data = await response.json();

      if (!response.ok) {
        throw {
          status: response.status,
          message: data.message || 'APIエラーが発生しました',
          error: data.error
        };
      }

      return data;
    } catch (error) {
      // ネットワークエラーなど
      if (error instanceof TypeError) {
        throw {
          status: 0,
          message: 'ネットワークエラーが発生しました',
          error: true
        };
      }
      throw error;
    }
  }

  /**
   * GET リクエスト
   */
  async get(endpoint, params = {}) {
    // キャッシュ無効化のためにタイムスタンプを追加
    const timestampedParams = {
      ...params,
      _t: Date.now()
    };

    const queryString = new URLSearchParams(timestampedParams).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.request(url, {
      method: 'GET'
    });
  }

  /**
   * POST リクエスト
   */
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: data
    });
  }

  /**
   * PUT リクエスト
   */
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data
    });
  }

  /**
   * DELETE リクエスト
   */
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }

  /**
   * POSTリクエスト（Blob形式で返す、PDF生成用）
   */
  async postForBlob(endpoint, data = {}) {
    const url = `${this.baseURL}${endpoint}`;

    // デフォルトヘッダー
    const headers = {
      'Content-Type': 'application/json'
    };

    // 認証トークンがあれば追加
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        cache: 'no-store'
      });

      // 認証エラーの場合の処理
      if (response.status === 401 || response.status === 403) {
        const data = await response.json();

        // JWT関連のエラーをチェック
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN' ||
            data.code === 'TOKEN_NOT_ACTIVE' || data.code === 'TOKEN_VERIFICATION_FAILED') {
          console.log('JWT認証エラーを検知しました。ログイン画面へ移動します。');
          console.log('エラー詳細:', data.message);
          this.removeToken();

          // ユーザーに通知
          if (data.code === 'TOKEN_EXPIRED') {
            alert('セッションの有効期限が切れました。再度ログインしてください。');
          } else {
            alert('認証に問題が発生しました。再度ログインしてください。');
          }

          // ログイン画面へリダイレクト
          window.location.href = '/';
          return;
        }

        // その他の403エラーの場合
        throw {
          status: response.status,
          message: data.message || 'アクセスが拒否されました',
          error: data.error,
          code: data.code
        };
      }

      if (!response.ok) {
        const data = await response.json();
        throw {
          status: response.status,
          message: data.message || 'APIエラーが発生しました',
          error: data.error
        };
      }

      // Blobとして返す
      return await response.blob();
    } catch (error) {
      // ネットワークエラーなど
      if (error instanceof TypeError) {
        throw {
          status: 0,
          message: 'ネットワークエラーが発生しました',
          error: true
        };
      }
      throw error;
    }
  }

  /**
   * トークン取得
   */
  getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
  }

  /**
   * トークン保存
   */
  setToken(token) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
  }

  /**
   * トークン削除
   */
  removeToken() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
  }
}

// シングルトンインスタンス
const apiClient = new ApiClient();

// グローバルに公開
window.apiClient = apiClient;