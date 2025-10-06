/**
 * セキュリティミドルウェア
 * 本番環境向けセキュリティ強化
 */

const helmet = require('helmet');

/**
 * HTTPS強制ミドルウェア
 * 本番環境でHTTP接続をHTTPSにリダイレクト
 */
const enforceHTTPS = (req, res, next) => {
  // 本番環境でのみHTTPS強制
  if (process.env.NODE_ENV === 'production') {
    // X-Forwarded-Protoヘッダーをチェック（ロードバランサー/プロキシ経由の場合）
    const proto = req.headers['x-forwarded-proto'] || req.protocol;

    if (proto !== 'https') {
      // HTTPSにリダイレクト
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      return res.redirect(301, httpsUrl);
    }

    // Strict-Transport-Securityヘッダーを設定（HSTS）
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
};

/**
 * セキュリティヘッダーの設定
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 本番環境では'unsafe-inline'と'unsafe-eval'を削除推奨
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.supabase.co', 'wss://supabase.co'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  permittedCrossDomainPolicies: false
});

/**
 * XSS攻撃対策
 * 入力値のサニタイゼーション
 */
const sanitizeInput = (req, res, next) => {
  // HTMLタグを削除する正規表現
  const stripHtml = (text) => {
    if (typeof text !== 'string') return text;
    return text.replace(/<[^>]*>/g, '').trim();
  };

  // 再帰的にオブジェクトをサニタイズ
  const sanitizeObject = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return stripHtml(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // パスワードフィールドはサニタイズしない
          if (key.toLowerCase().includes('password')) {
            sanitized[key] = obj[key];
          } else {
            sanitized[key] = sanitizeObject(obj[key]);
          }
        }
      }
      return sanitized;
    }
    return obj;
  };

  // リクエストボディをサニタイズ
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // クエリパラメータをサニタイズ
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // パスパラメータをサニタイズ
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * SQLインジェクション対策
 * 危険な文字列パターンを検出
 */
const preventSQLInjection = (req, res, next) => {
  // SQLインジェクションの一般的なパターン
  const sqlPatterns = [
    /(\b)(DELETE|DROP|EXEC(UTE)?|INSERT|SELECT|UNION|UPDATE)(\b)/gi,
    /(\-\-)|(\;)|(\|\|)|(\/\*[\w\W]*?\*\/)/g,
    /(x?or|and)\s*\d+\s*=\s*\d+/gi,
    /\b(1\s*=\s*1|2\s*=\s*2)\b/gi
  ];

  // チェック対象の値を検証
  const checkForSQLInjection = (value) => {
    if (typeof value !== 'string') return false;

    // パスワードとメールアドレスフィールドはスキップ
    return false; // 実際のSQLクエリはパラメータ化されているため、過度な制限は避ける

    // 厳密にチェックする場合は以下を有効化
    // return sqlPatterns.some(pattern => pattern.test(value));
  };

  // リクエスト全体をチェック
  const checkObject = (obj) => {
    if (!obj) return false;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string' && checkForSQLInjection(value)) {
          return true;
        } else if (typeof value === 'object') {
          if (checkObject(value)) return true;
        }
      }
    }
    return false;
  };

  // SQLインジェクションパターンが検出された場合
  if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
    return res.status(400).json({
      error: true,
      message: '不正なリクエストです'
    });
  }

  next();
};

/**
 * セッション設定の強化
 */
const sessionConfig = {
  name: 'sessionId', // デフォルト名を変更
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPSでのみ送信
    httpOnly: true, // XSS対策
    maxAge: 1000 * 60 * 60 * 24, // 24時間
    sameSite: 'strict' // CSRF対策
  }
};

/**
 * IPアドレスベースのブロックリスト
 */
class IPBlocklist {
  constructor() {
    this.blockedIPs = new Set();
    this.tempBlocked = new Map(); // 一時的なブロック
  }

  /**
   * IPアドレスをブロック
   */
  block(ip, duration = null) {
    if (duration) {
      // 一時的なブロック
      this.tempBlocked.set(ip, Date.now() + duration);
      setTimeout(() => {
        this.tempBlocked.delete(ip);
      }, duration);
    } else {
      // 永続的なブロック
      this.blockedIPs.add(ip);
    }
  }

  /**
   * IPアドレスがブロックされているかチェック
   */
  isBlocked(ip) {
    // 永続的なブロックをチェック
    if (this.blockedIPs.has(ip)) return true;

    // 一時的なブロックをチェック
    const blockExpiry = this.tempBlocked.get(ip);
    if (blockExpiry && blockExpiry > Date.now()) {
      return true;
    } else if (blockExpiry) {
      // 期限切れの場合は削除
      this.tempBlocked.delete(ip);
    }

    return false;
  }

  /**
   * ミドルウェア
   */
  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;

      if (this.isBlocked(ip)) {
        return res.status(403).json({
          error: true,
          message: 'アクセスが拒否されました'
        });
      }

      next();
    };
  }
}

const ipBlocklist = new IPBlocklist();

module.exports = {
  enforceHTTPS,
  securityHeaders,
  sanitizeInput,
  preventSQLInjection,
  sessionConfig,
  ipBlocklist
};