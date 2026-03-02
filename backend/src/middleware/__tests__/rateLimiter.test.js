/**
 * レートリミッター テスト
 */

// setIntervalの副作用を防止
jest.useFakeTimers();

// supabase モック (agencyCreationRateLimit が require している)
jest.mock('../../config/supabase', () => ({
  supabase: {},
}));

const {
  loginRateLimit,
  passwordResetRateLimit,
  generalRateLimit,
  agencyCreationRateLimit,
} = require('../rateLimiter');

// ── ヘルパー ──

function makeMockReq(overrides = {}) {
  return {
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    body: {},
    user: null,
    ...overrides,
  };
}

function makeMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ── loginRateLimit ──

describe('loginRateLimit', () => {
  beforeEach(() => {
    // タイマーをリセットして各テストで独立した時間を使う
    jest.setSystemTime(Date.now());
  });

  test('初回リクエスト → 通過', () => {
    const req = makeMockReq({
      ip: '10.0.0.1',
      body: { email: `unique-${Date.now()}@test.com` },
    });
    const res = makeMockRes();
    const next = jest.fn();

    loginRateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('5回超過 → 429', () => {
    const email = `ratelimit-${Date.now()}@test.com`;
    const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    for (let i = 0; i < 5; i++) {
      const req = makeMockReq({ ip, body: { email } });
      const res = makeMockRes();
      const next = jest.fn();
      loginRateLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    }

    // 6回目 → 拒否
    const req = makeMockReq({ ip, body: { email } });
    const res = makeMockRes();
    const next = jest.fn();
    loginRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('異なるメールは別カウント', () => {
    const ip = `10.1.${Math.floor(Math.random() * 255)}.1`;

    for (let i = 0; i < 5; i++) {
      const req = makeMockReq({ ip, body: { email: `a-${Date.now()}@test.com` } });
      loginRateLimit(req, makeMockRes(), jest.fn());
    }

    // 別メール → 通過
    const req = makeMockReq({ ip, body: { email: `b-${Date.now()}@test.com` } });
    const res = makeMockRes();
    const next = jest.fn();
    loginRateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ── passwordResetRateLimit ──

describe('passwordResetRateLimit', () => {
  test('3回超過 → 429', () => {
    const email = `reset-${Date.now()}@test.com`;
    const ip = `10.2.${Math.floor(Math.random() * 255)}.1`;

    for (let i = 0; i < 3; i++) {
      const req = makeMockReq({ ip, body: { email } });
      passwordResetRateLimit(req, makeMockRes(), jest.fn());
    }

    // 4回目 → 拒否
    const req = makeMockReq({ ip, body: { email } });
    const res = makeMockRes();
    const next = jest.fn();
    passwordResetRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── generalRateLimit ──

describe('generalRateLimit', () => {
  test('初回 → 通過', () => {
    const req = makeMockReq({
      user: { id: `user-general-${Date.now()}` },
    });
    const res = makeMockRes();
    const next = jest.fn();

    generalRateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('100回超過 → 429', () => {
    const userId = `user-burst-${Date.now()}`;

    for (let i = 0; i < 100; i++) {
      const req = makeMockReq({ user: { id: userId } });
      generalRateLimit(req, makeMockRes(), jest.fn());
    }

    // 101回目 → 拒否
    const req = makeMockReq({ user: { id: userId } });
    const res = makeMockRes();
    const next = jest.fn();
    generalRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── agencyCreationRateLimit ──

describe('agencyCreationRateLimit', () => {
  test('管理者 → 制限なし', async () => {
    const req = makeMockReq({ user: { role: 'admin', id: 'admin-1' } });
    const res = makeMockRes();
    const next = jest.fn();

    await agencyCreationRateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('代理店ユーザー 初回 → 通過', async () => {
    const req = makeMockReq({
      user: { role: 'agency', id: `agency-${Date.now()}`, agency_id: `ag-${Date.now()}` },
    });
    const res = makeMockRes();
    const next = jest.fn();

    await agencyCreationRateLimit(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
