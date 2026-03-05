/**
 * httpOnly Cookie設定ヘルパー
 * JWTトークンをlocalStorageではなくhttpOnly Cookieで管理することでXSSリスクを低減
 */

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * アクセストークンをhttpOnly Cookieに設定
 * @param {Object} res - Express response
 * @param {String} token - JWT token
 * @param {Object} options - { rememberMe: boolean }
 */
function setTokenCookie(res, token, options = {}) {
  // rememberMe: true → 30日, false → セッションCookie（maxAge省略でブラウザ閉じたら消える）
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/'
  };
  if (options.rememberMe) {
    cookieOpts.maxAge = 30 * 24 * 60 * 60 * 1000; // 30日
  }
  // rememberMe=false の場合、maxAgeを設定しない → セッションCookie
  res.cookie('access_token', token, cookieOpts);
}

/**
 * リフレッシュトークンをhttpOnly Cookieに設定
 * @param {Object} res - Express response
 * @param {String} refreshToken - refresh JWT token
 * @param {Object} options - { rememberMe: boolean }
 */
function setRefreshTokenCookie(res, refreshToken, options = {}) {
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/api/auth'
  };
  if (options.rememberMe) {
    cookieOpts.maxAge = 30 * 24 * 60 * 60 * 1000; // 30日
  }
  res.cookie('refresh_token', refreshToken, cookieOpts);
}

/**
 * 認証Cookieをクリア
 */
function clearAuthCookies(res) {
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax'
  };
  res.clearCookie('access_token', { ...cookieOpts, path: '/' });
  res.clearCookie('refresh_token', { ...cookieOpts, path: '/api/auth' });
}

module.exports = { setTokenCookie, setRefreshTokenCookie, clearAuthCookies };
