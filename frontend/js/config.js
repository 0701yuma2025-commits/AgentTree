/**
 * アプリケーション設定
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
  DEBUG: window.location.hostname === 'localhost'
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