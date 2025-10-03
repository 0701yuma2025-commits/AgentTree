/**
 * レート制限ミドルウェア
 */

const { supabase } = require('../config/supabase');

// メモリストレージ（本番環境ではRedis推奨）
const rateLimitStore = new Map();

/**
 * レート制限チェック
 * @param {string} key - ユーザー識別キー
 * @param {number} maxRequests - 最大リクエスト数
 * @param {number} windowMs - 時間窓（ミリ秒）
 */
const checkRateLimit = (key, maxRequests, windowMs) => {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);

  // 古いリクエストを削除
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  // リクエスト数チェック
  if (validRequests.length >= maxRequests) {
    return false;
  }

  // 新しいリクエストを記録
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);

  return true;
};

/**
 * 代理店登録レート制限ミドルウェア
 * 代理店ユーザー：1時間に10件、1日に50件まで
 * 管理者：制限なし
 */
const agencyCreationRateLimit = async (req, res, next) => {
  try {
    // 管理者は制限なし
    if (req.user.role === 'admin') {
      return next();
    }

    // 代理店ユーザーの場合
    if (req.user.role === 'agency') {
      const userId = req.user.id;
      const agencyId = req.user.agency_id;

      // 1時間制限チェック（10件）
      const hourlyKey = `agency_creation_hourly_${agencyId || userId}`;
      const hourlyAllowed = checkRateLimit(hourlyKey, 10, 60 * 60 * 1000);

      if (!hourlyAllowed) {
        return res.status(429).json({
          success: false,
          message: '1時間あたりの登録上限（10件）に達しました。しばらく待ってから再度お試しください。'
        });
      }

      // 1日制限チェック（50件）
      const dailyKey = `agency_creation_daily_${agencyId || userId}`;
      const dailyAllowed = checkRateLimit(dailyKey, 50, 24 * 60 * 60 * 1000);

      if (!dailyAllowed) {
        return res.status(429).json({
          success: false,
          message: '1日あたりの登録上限（50件）に達しました。明日再度お試しください。'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Rate limit check error:', error);
    // エラーの場合は通過させる（セキュリティより可用性を優先）
    next();
  }
};

/**
 * ログインレート制限
 * 15分で5回まで
 */
const loginRateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const email = req.body.email;
  const key = `login_${ip}_${email}`;

  const allowed = checkRateLimit(key, 5, 15 * 60 * 1000);

  if (!allowed) {
    return res.status(429).json({
      success: false,
      message: 'ログイン試行回数が上限に達しました。15分後に再度お試しください。'
    });
  }

  next();
};

/**
 * パスワードリセットレート制限
 * 1時間で3回まで
 */
const passwordResetRateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const email = req.body.email;
  const key = `password_reset_${ip}_${email}`;

  const allowed = checkRateLimit(key, 3, 60 * 60 * 1000);

  if (!allowed) {
    return res.status(429).json({
      success: false,
      message: 'パスワードリセット試行回数が上限に達しました。1時間後に再度お試しください。'
    });
  }

  next();
};

/**
 * API全体のレート制限
 * 1分間に100リクエストまで
 */
const generalRateLimit = (req, res, next) => {
  const userId = req.user?.id || req.ip;
  const key = `api_general_${userId}`;

  const allowed = checkRateLimit(key, 100, 60 * 1000);

  if (!allowed) {
    return res.status(429).json({
      success: false,
      message: 'リクエスト数が上限に達しました。しばらく待ってから再度お試しください。'
    });
  }

  next();
};

/**
 * レート制限情報をクリアする（定期的に実行）
 */
const clearOldRateLimits = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24時間

  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(timestamp => timestamp > now - maxAge);

    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
};

// 1時間ごとに古いデータをクリア
setInterval(clearOldRateLimits, 60 * 60 * 1000);

module.exports = {
  agencyCreationRateLimit,
  loginRateLimit,
  passwordResetRateLimit,
  generalRateLimit
};