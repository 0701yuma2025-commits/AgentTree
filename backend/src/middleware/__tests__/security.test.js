/**
 * セキュリティミドルウェア テスト
 */

// security.js のタイマー副作用を防ぐため、モジュール読み込み前にモック不要
// (security.js にはsetInterval等がないため)

const {
  enforceHTTPS,
  sanitizeInput,
  preventSQLInjection,
  ipBlocklist,
  IPBlocklist,
} = (() => {
  // ipBlocklist はシングルトンインスタンスなのでそのまま読み込む
  const mod = require('../security');
  return mod;
})();

// ── ヘルパー ──

function makeMockReq(overrides = {}) {
  return {
    headers: {},
    protocol: 'https',
    url: '/api/test',
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

// ── enforceHTTPS ──

describe('enforceHTTPS', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  test('開発環境ではHTTPでも通過', () => {
    process.env.NODE_ENV = 'development';
    const req = makeMockReq({ protocol: 'http', headers: {} });
    const res = makeMockRes();
    const next = jest.fn();

    enforceHTTPS(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('本番環境でHTTP → 301リダイレクト', () => {
    process.env.NODE_ENV = 'production';
    const req = makeMockReq({
      protocol: 'http',
      headers: { host: 'example.com' },
      url: '/api/test',
    });
    const res = makeMockRes();
    const next = jest.fn();

    enforceHTTPS(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/api/test');
    expect(next).not.toHaveBeenCalled();
  });

  test('本番環境でx-forwarded-proto=https → 通過 + HSTSヘッダー', () => {
    process.env.NODE_ENV = 'production';
    const req = makeMockReq({
      headers: { 'x-forwarded-proto': 'https', host: 'example.com' },
    });
    const res = makeMockRes();
    const next = jest.fn();

    enforceHTTPS(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('max-age=')
    );
  });
});

// ── sanitizeInput ──

describe('sanitizeInput', () => {
  test('HTMLタグを除去', () => {
    const req = makeMockReq({
      body: { name: '<script>alert("xss")</script>テスト' },
      query: {},
      params: {},
    });
    const res = makeMockRes();
    const next = jest.fn();

    sanitizeInput(req, res, next);

    expect(req.body.name).toBe('alert("xss")テスト');
    expect(next).toHaveBeenCalled();
  });

  test('ネストされたオブジェクトもサニタイズ', () => {
    const req = makeMockReq({
      body: {
        user: {
          name: '<b>太郎</b>',
          tags: ['<i>tag1</i>', 'tag2'],
        },
      },
      query: {},
      params: {},
    });
    const res = makeMockRes();
    const next = jest.fn();

    sanitizeInput(req, res, next);

    expect(req.body.user.name).toBe('太郎');
    expect(req.body.user.tags[0]).toBe('tag1');
    expect(req.body.user.tags[1]).toBe('tag2');
  });

  test('passwordフィールドはサニタイズしない', () => {
    const req = makeMockReq({
      body: { password: '<special>P@ss</special>' },
      query: {},
      params: {},
    });
    const res = makeMockRes();
    const next = jest.fn();

    sanitizeInput(req, res, next);

    expect(req.body.password).toBe('<special>P@ss</special>');
  });

  test('クエリパラメータもサニタイズ', () => {
    const req = makeMockReq({
      body: {},
      query: { search: '<img src=x onerror=alert(1)>' },
      params: {},
    });
    const res = makeMockRes();
    const next = jest.fn();

    sanitizeInput(req, res, next);

    expect(req.query.search).not.toContain('<');
  });

  test('null/undefinedは安全に処理', () => {
    const req = makeMockReq({
      body: { a: null, b: undefined, c: 42 },
      query: {},
      params: {},
    });
    const res = makeMockRes();
    const next = jest.fn();

    sanitizeInput(req, res, next);

    expect(req.body.a).toBeNull();
    expect(req.body.b).toBeUndefined();
    expect(req.body.c).toBe(42);
    expect(next).toHaveBeenCalled();
  });
});

// ── IPBlocklist ──

describe('IPBlocklist', () => {
  // テスト毎に新しいインスタンスを使う
  let blocklist;
  beforeEach(() => {
    blocklist = new (ipBlocklist.constructor)();
  });

  test('永続ブロック → isBlocked=true', () => {
    blocklist.block('192.168.1.1');
    expect(blocklist.isBlocked('192.168.1.1')).toBe(true);
    expect(blocklist.isBlocked('192.168.1.2')).toBe(false);
  });

  test('一時ブロック → 期限内はtrue', () => {
    blocklist.block('10.0.0.1', 5000); // 5秒
    expect(blocklist.isBlocked('10.0.0.1')).toBe(true);
  });

  test('一時ブロック期限切れ → false', () => {
    blocklist.block('10.0.0.2', 1); // 1ms
    // 期限切れを強制
    blocklist.tempBlocked.set('10.0.0.2', Date.now() - 1000);
    expect(blocklist.isBlocked('10.0.0.2')).toBe(false);
  });

  test('middleware() → ブロック済みIPは403', () => {
    blocklist.block('1.2.3.4');
    const middleware = blocklist.middleware();

    const req = { ip: '1.2.3.4' };
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('middleware() → 未ブロックIPは通過', () => {
    const middleware = blocklist.middleware();

    const req = { ip: '5.6.7.8' };
    const res = makeMockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ── preventSQLInjection ──

describe('preventSQLInjection', () => {
  test('no-op → 常に通過', () => {
    const req = makeMockReq({ body: { query: "'; DROP TABLE users;--" } });
    const res = makeMockRes();
    const next = jest.fn();

    preventSQLInjection(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
