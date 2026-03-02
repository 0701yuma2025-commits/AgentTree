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
// トークン管理
// ═══════════════════════════════════════════════
describe('ApiClient トークン管理', () => {
  test('setToken → getTokenで取得可能', () => {
    apiClient.setToken('test-token-123');
    expect(apiClient.getToken()).toBe('test-token-123');
  });

  test('removeToken → getToken=null', () => {
    apiClient.setToken('to-be-removed');
    apiClient.removeToken();
    expect(apiClient.getToken()).toBeNull();
  });

  test('トークン未設定 → getToken=null', () => {
    expect(apiClient.getToken()).toBeNull();
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
// 認証ヘッダー
// ═══════════════════════════════════════════════
describe('ApiClient 認証ヘッダー', () => {
  test('トークンあり → Authorizationヘッダー付与', async () => {
    apiClient.setToken('my-jwt-token');
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.get('/protected');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  test('トークンなし → Authorizationヘッダーなし', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await apiClient.get('/public');

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

  test('TOKEN_EXPIRED → トークン削除', async () => {
    apiClient.setToken('expired-token');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'TOKEN_EXPIRED', message: 'Token expired' }),
    });

    await apiClient.get('/protected');

    // トークンが削除されていること
    expect(apiClient.getToken()).toBeNull();
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
