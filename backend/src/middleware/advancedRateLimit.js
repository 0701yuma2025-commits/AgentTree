/**
 * 高度なレート制限ミドルウェア
 * 要件定義書に基づく実装
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

// Redis接続（本番環境では環境変数から設定）
const redisClient = process.env.REDIS_URL ?
  new Redis(process.env.REDIS_URL) :
  null; // Redisが利用できない場合はメモリストアを使用

/**
 * ログイン試行のレート制限
 * 15分間に5回までの試行を許可
 */
const loginRateLimiter = rateLimit({
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:login:',
  }) : undefined, // Redisが利用できない場合はメモリストアを使用
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 最大5回
  message: {
    error: true,
    message: 'ログイン試行が多すぎます。15分後に再度お試しください。',
    retryAfter: 15
  },
  standardHeaders: true,
  legacyHeaders: false,
  // IPアドレスとメールアドレスの組み合わせでレート制限
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${req.ip}:${email}`;
  },
  // 失敗したログインのみカウント
  skipSuccessfulRequests: true
});

/**
 * 招待作成のレート制限
 * 1時間に10回まで
 */
const invitationRateLimiter = rateLimit({
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:invitation:',
  }) : undefined,
  windowMs: 60 * 60 * 1000, // 1時間
  max: 10, // 最大10回
  message: {
    error: true,
    message: '招待作成の制限に達しました。1時間後に再度お試しください。',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ユーザーIDベースでレート制限
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  }
});

/**
 * API全体のレート制限
 * 1分間に100リクエストまで
 */
const globalApiRateLimiter = rateLimit({
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:api:',
  }) : undefined,
  windowMs: 60 * 1000, // 1分
  max: 100, // 最大100リクエスト
  message: {
    error: true,
    message: 'リクエストが多すぎます。しばらく待ってから再度お試しください。',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 認証済みユーザーは制限を緩和
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // 管理者は制限をスキップ
    return req.user?.role === 'admin';
  }
});

/**
 * パスワードリセットのレート制限
 * 1時間に3回まで
 */
const passwordResetRateLimiter = rateLimit({
  store: redisClient ? new RedisStore({
    client: redisClient,
    prefix: 'rl:pwreset:',
  }) : undefined,
  windowMs: 60 * 60 * 1000, // 1時間
  max: 3, // 最大3回
  message: {
    error: true,
    message: 'パスワードリセットのリクエストが多すぎます。1時間後に再度お試しください。',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${req.ip}:${email}`;
  }
});

/**
 * ブルートフォース攻撃対策
 * 連続失敗時の指数関数的な遅延
 */
class BruteForceProtection {
  constructor() {
    this.attempts = new Map();
  }

  /**
   * ログイン失敗を記録
   */
  recordFailure(key) {
    const current = this.attempts.get(key) || { count: 0, lastAttempt: Date.now() };
    current.count++;
    current.lastAttempt = Date.now();
    this.attempts.set(key, current);

    // 24時間後に自動クリア
    setTimeout(() => {
      this.attempts.delete(key);
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * ログイン成功時にカウントをリセット
   */
  recordSuccess(key) {
    this.attempts.delete(key);
  }

  /**
   * 遅延時間を計算（指数関数的増加）
   */
  getDelay(key) {
    const attempt = this.attempts.get(key);
    if (!attempt) return 0;

    // 3回失敗後から遅延開始
    if (attempt.count <= 3) return 0;

    // 指数関数的な遅延（最大30秒）
    const delay = Math.min(Math.pow(2, attempt.count - 3) * 1000, 30000);
    return delay;
  }

  /**
   * ミドルウェア
   */
  middleware() {
    return async (req, res, next) => {
      const key = `${req.ip}:${req.body?.email || 'unknown'}`;
      const delay = this.getDelay(key);

      if (delay > 0) {
        // 遅延を追加
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // レスポンスを監視して失敗/成功を記録
      const originalJson = res.json;
      res.json = function(data) {
        if (req.path === '/api/auth/login') {
          if (data.error || !data.success) {
            bruteForceProtection.recordFailure(key);
          } else {
            bruteForceProtection.recordSuccess(key);
          }
        }
        return originalJson.call(this, data);
      };

      next();
    };
  }
}

const bruteForceProtection = new BruteForceProtection();

module.exports = {
  loginRateLimiter,
  invitationRateLimiter,
  globalApiRateLimiter,
  passwordResetRateLimiter,
  bruteForceProtection
};