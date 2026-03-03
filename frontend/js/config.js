/**
 * アプリケーション設定
 * ハードコードされた値はすべてここに集約する
 */

const CONFIG = {
  // APIベースURL（環境に応じて自動切替）
  API_BASE_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://agenttree.onrender.com/api',

  // ローカルストレージキー
  STORAGE_KEYS: {
    TOKEN: 'agency_system_token',
    USER: 'agency_system_user',
    REFRESH_TOKEN: 'agency_system_refresh_token'
  },

  // トークン有効期限（ミリ秒）
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7日

  // ページサイズ
  PAGE_SIZE: 20,

  // デバッグモード
  DEBUG: window.location.hostname === 'localhost',

  // ========================================
  // ビジネスデフォルト値
  // ========================================

  // 報酬設定デフォルト値
  COMMISSION_DEFAULTS: {
    TIER1_FROM_TIER2_BONUS: 2.00,
    TIER2_FROM_TIER3_BONUS: 1.50,
    TIER3_FROM_TIER4_BONUS: 1.00,
    MINIMUM_PAYMENT_AMOUNT: 10000,
    PAYMENT_CYCLE: 'monthly',
    PAYMENT_DAY: 25,
    CLOSING_DAY: 31,
    WITHHOLDING_TAX_RATE: 10.21,
    NON_INVOICE_DEDUCTION_RATE: 2.00
  },

  // 商品Tier別デフォルト報酬率（%）
  PRODUCT_TIER_DEFAULTS: {
    TIER1: 10,
    TIER2: 8,
    TIER3: 6,
    TIER4: 4
  },

  // キャンペーン設定
  CAMPAIGN: {
    DEFAULT_DURATION_DAYS: 30,
    DATE_MIN: '2020-01-01',
    DATE_MAX: '2099-12-31'
  },

  // ========================================
  // テーブル・ページネーション
  // ========================================

  TABLE: {
    DEFAULT_PAGE_SIZE: 25,
    AUDIT_LOG_PAGE_SIZE: 50,
    PAGE_SIZE_OPTIONS: [10, 25, 50, 100]
  },

  // ========================================
  // バリデーション
  // ========================================

  VALIDATION: {
    PASSWORD_MIN_LENGTH: 8,
    TWO_FA_CODE_LENGTH: 6
  },

  // ========================================
  // UI タイミング（ミリ秒）
  // ========================================

  TIMING: {
    LOGIN_REDIRECT_DELAY: 500,
    SUCCESS_MESSAGE_DURATION: 3000,
    ERROR_MESSAGE_DURATION: 5000,
    FOCUS_DELAY: 100,
    MODAL_CLOSE_DELAY: 1000
  },

  // ========================================
  // 通貨表示
  // ========================================

  CURRENCY: {
    OKU_THRESHOLD: 100000000,  // 1億
    MAN_THRESHOLD: 10000       // 1万
  },

  // ========================================
  // ネットワーク可視化
  // ========================================

  TIER_COLORS: {
    1: '#ff4444',  // 赤
    2: '#4444ff',  // 青
    3: '#44ff44',  // 緑
    4: '#ffaa44'   // オレンジ
  },

  NETWORK: {
    BACKGROUND_COLOR: '#1a1a2e',
    TIER_Y_SPACING: 200,
    CAMERA_FIT_DELAY: 1000,
    FILTER_CAMERA_DELAY: 500
  }
};

// デバッグログ
function debugLog(...args) {
  if (CONFIG.DEBUG) {
    console.log('[Agency System]', ...args);
  }
}

// エラーログ
function errorLog(...args) {
  console.error('[Agency System Error]', ...args);
}
