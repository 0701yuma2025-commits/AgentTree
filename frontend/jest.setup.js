/**
 * Frontend Jest セットアップ
 */

// グローバルCONFIG（config.jsの代替）
global.CONFIG = {
  API_BASE_URL: 'http://localhost:3001/api',
  STORAGE_KEYS: {
    TOKEN: 'agency_system_token',
    USER: 'agency_system_user',
    REFRESH_TOKEN: 'agency_system_refresh_token'
  },
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  PAGE_SIZE: 20,
  DEBUG: false
};

// escapeHtml グローバル関数
global.escapeHtml = (text) => String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);

// console抑制
console.error = () => {};
console.warn = () => {};
console.log = () => {};
