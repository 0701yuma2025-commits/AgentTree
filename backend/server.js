/**
 * 多段階営業代理店管理システム - バックエンドAPIサーバー
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// セキュリティミドルウェアのインポート
const { enforceHTTPS, securityHeaders, sanitizeInput, preventSQLInjection, ipBlocklist } = require('./src/middleware/security');
const { loginRateLimiter, invitationRateLimiter, globalApiRateLimiter, passwordResetRateLimiter, bruteForceProtection } = require('./src/middleware/advancedRateLimit');

// スケジューラーのインポート
const { startScheduler } = require('./src/scripts/cron-scheduler');

// 必須環境変数の検証（起動時にfail-fast）
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`FATAL: 必須環境変数が未設定です: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Expressアプリケーション初期化
const app = express();

// ヘルスチェック（CORS・セキュリティミドルウェアの前に配置）
app.get('/health', async (req, res) => {
  try {
    const { supabase } = require('./src/config/supabase');
    const { error } = await supabase.from('users').select('id').limit(1);
    res.json({
      status: error ? 'DEGRADED' : 'OK',
      timestamp: new Date().toISOString(),
      db: error ? 'disconnected' : 'connected'
    });
  } catch (e) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      db: 'disconnected'
    });
  }
});

// HTTPS強制（本番環境）
app.use(enforceHTTPS);

// セキュリティヘッダー設定
app.use(securityHeaders);

// IPブロックリスト
app.use(ipBlocklist.middleware());

// ブルートフォース攻撃対策
app.use(bruteForceProtection.middleware());

// CORS設定
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8000',
  'https://agenttree-frontend.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // origin が無いリクエスト（サーバー間通信等）は本番では拒否
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin header required'));
      }
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// グローバルAPIレート制限
app.use('/api/', globalApiRateLimiter);

// 特定エンドポイント用のレート制限
app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth/reset-password-request', passwordResetRateLimiter);
app.use('/api/invitations', invitationRateLimiter);

// ボディパーサー
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 入力値のサニタイゼーション
app.use(sanitizeInput);

// SQLインジェクション対策
app.use(preventSQLInjection);

// ルート定義
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/agencies', require('./src/routes/agencies'));
app.use('/api/sales', require('./src/routes/sales'));
app.use('/api/commissions', require('./src/routes/commissions'));
app.use('/api/invitations', require('./src/routes/invitations'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/commission-settings', require('./src/routes/commission-settings'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/invoices', require('./src/routes/invoices'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/campaigns', require('./src/routes/campaigns'));
app.use('/api/network', require('./src/routes/network'));
app.use('/api/audit-logs', require('./src/routes/audit-logs'));
app.use('/api/document-recipients', require('./src/routes/document-recipients'));

// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'エンドポイントが見つかりません'
  });
});

// エラーハンドラー
app.use((err, req, res, next) => {
  console.error('Error:', err);

  const status = err.status || 500;

  // 本番環境では内部エラーの詳細をクライアントに露出しない
  let message;
  if (status < 500) {
    // 4xx: クライアントエラーはメッセージを返して良い
    message = err.message || 'リクエストエラーが発生しました';
  } else if (process.env.NODE_ENV === 'development') {
    message = err.message || 'サーバーエラーが発生しました';
  } else {
    // 5xx 本番: 汎用メッセージのみ
    message = 'サーバーエラーが発生しました。しばらく後にお試しください。';
  }

  res.status(status).json({
    error: true,
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// サーバー起動
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);

  // スケジューラーを起動
  if (process.env.ENABLE_SCHEDULER !== 'false') {
    startScheduler();
  }
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // 10秒以内にクローズできなければ強制終了
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));