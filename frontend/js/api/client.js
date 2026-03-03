/**
 * APIクライアント
 */

class ApiClient {
  constructor() {
    this.baseURL = CONFIG.API_BASE_URL;
  }

  /**
   * HTTPリクエスト送信
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} options - fetchオプション
   * @param {string} [options.responseType] - 'blob'を指定するとBlobで返す（PDF生成用）
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const { responseType, ...fetchOptions } = options;

    // デフォルトヘッダー
    const headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers
    };

    // 認証はhttpOnly Cookieで自動送信（Bearer headerは不要）

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined,
        cache: 'no-store',  // ブラウザキャッシュを完全に無効化
        credentials: 'include'  // httpOnly Cookieを自動送信（XSS対策）
      });

      // 認証エラーの場合の処理
      if (response.status === 401 || response.status === 403) {
        const data = await response.json();

        // JWT関連のエラーをチェック
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN' ||
            data.code === 'TOKEN_NOT_ACTIVE' || data.code === 'TOKEN_VERIFICATION_FAILED') {
          console.log('JWT認証エラーを検知しました。ログイン画面へ移動します。');
          console.log('エラー詳細:', data.message);
          this.clearSession();

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
        if (responseType === 'blob') {
          throw {
            status: response.status,
            message: data.message || 'アクセスが拒否されました',
            error: data.error,
            code: data.code
          };
        }
        console.error('アクセス権限エラー:', data.message || 'アクセスが拒否されました');
        return {
          success: false,
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

      // Blob形式で返す（PDF生成用）
      if (responseType === 'blob') {
        return await response.blob();
      }

      return await response.json();
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

    // 既存のクエリパラメータがあるか確認
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = queryString ? `${endpoint}${separator}${queryString}` : endpoint;

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
    return this.request(endpoint, {
      method: 'POST',
      body: data,
      responseType: 'blob'
    });
  }

  /**
   * セッション情報をクリア（トークンはhttpOnly Cookieなのでサーバー側で管理）
   */
  clearSession() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN); // レガシー cleanup
  }
}

// シングルトンインスタンス
const apiClient = new ApiClient();

// グローバルに公開
window.apiClient = apiClient;