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

// Expressアプリケーション初期化
const app = express();

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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
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

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

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
  const message = err.message || 'サーバーエラーが発生しました';

  res.status(status).json({
    error: true,
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// サーバー起動
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);

  // スケジューラーを起動
  if (process.env.ENABLE_SCHEDULER !== 'false') {
    startScheduler();
  }
});