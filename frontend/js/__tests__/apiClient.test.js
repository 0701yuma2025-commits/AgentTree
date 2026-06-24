/**
 * ApiClient テスト
 */

const fs = require('fs');
const path = require('path');

// fetch モック
global.fetch = jest.fn();

// alert モック
global.alert = jest.fn();

// ApiClient を読み込み（jsdom の localStorage をそのまま使用）
const code = fs.readFileSync(path.resolve(__dirname, '../api/client.js'), 'utf-8');
const mockWindow = { location: { href: '' } };
const fn = new Function('window', 'CONFIG', 'localStorage', 'fetch', 'alert', 'URLSearchParams', code);
fn(mockWindow, global.CONFIG, global.localStorage, global.fetch, global.alert, URLSearchParams);

const apiClient = mockWindow.apiClient;

beforeEach(() => {
  jest.clearAllMocks();
  global.localStorage.clear();
  mockWindow.location = { href: '' };
});

// ═══════════════════════════════════════════════
// セッション管理（httpOnly Cookie方式）
// ═══════════════════════════════════════════════
describe('ApiClient セッション管理', () => {
  test('clearSession → localStorageからユーザー情報を削除', () => {
    global.localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify({ id: '1', email: 'test@example.com' }));
    global.localStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, 'old-token');
    global.localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, 'legacy-token');

    apiClient.clearSession();

    expect(global.localStorage.getItem(CONFIG.STORAGE_KEYS.USER)).toBeNull();
    expect(global.localStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(global.localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN)).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// HTTP メソッド
// ═══════════════════════════════════════════════
describe('ApiClient HTTPメソッド', () => {
  test('GET → fetchにGETで呼び出し', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });

    const result = await apiClient.get('/test');
    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/test');
    expect(options.method).toBe('GET');
  });

  test('GET → タイムスタンプパラメータ付与', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.get('/test');
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('_t=');
  });

  test('POST → bodyがJSON化される', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.post('/test', { key: 'value' });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ key: 'value' }));
  });

  test('PUT → PUTメソッドで送信', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.put('/test', { name: 'updated' });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PUT');
  });

  test('DELETE → DELETEメソッドで送信', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.delete('/test/123');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('DELETE');
  });
});

// ═══════════════════════════════════════════════
// Cookie認証（httpOnly Cookie方式）
// ═══════════════════════════════════════════════
describe('ApiClient Cookie認証', () => {
  test('リクエストにcredentials:includeが設定される', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.get('/protected');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.credentials).toBe('include');
  });

  test('Authorizationヘッダーは付与されない', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.get('/protected');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// エラーハンドリング
// ═══════════════════════════════════════════════
describe('ApiClient エラーハンドリング', () => {
  test('APIエラー(500) → 例外をthrow', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'サーバーエラー' }),
    });

    await expect(apiClient.get('/fail')).rejects.toMatchObject({
      status: 500,
      message: 'サーバーエラー',
    });
  });

  test('ネットワークエラー → TypeError例外', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.get('/fail')).rejects.toMatchObject({
      status: 0,
      message: 'ネットワークエラーが発生しました',
    });
  });

  test('TOKEN_EXPIRED → セッションクリア&リダイレクト', async () => {
    global.localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify({ id: '1' }));
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'TOKEN_EXPIRED', message: 'Token expired' }),
    });

    await apiClient.get('/protected');

    expect(global.localStorage.getItem(CONFIG.STORAGE_KEYS.USER)).toBeNull();
    expect(global.alert).toHaveBeenCalledWith('セッションの有効期限が切れました。再度ログインしてください。');
    expect(mockWindow.location.href).toBe('/');
  });

  test('403権限エラー → success:false返却', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: 'FORBIDDEN', message: '権限がありません' }),
    });

    const result = await apiClient.get('/admin-only');
    expect(result.success).toBe(false);
    expect(result.message).toBe('権限がありません');
  });

  test('postForBlob → Blob返却', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => mockBlob,
    });

    const result = await apiClient.postForBlob('/invoices/generate', { id: '123' });
    expect(result).toBeInstanceOf(Blob);
  });
});
