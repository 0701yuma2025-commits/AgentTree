/**
 * httpOnly Cookie設定ヘルパー
 * JWTトークンをlocalStorageではなくhttpOnly Cookieで管理することでXSSリスクを低減
 */

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * アクセストークンをhttpOnly Cookieに設定
 */
function setTokenCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7日
    path: '/'
  });
}

/**
 * リフレッシュトークンをhttpOnly Cookieに設定
 */
function setRefreshTokenCookie(res, refreshToken) {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
    path: '/api/auth'  // 認証エンドポイントのみで送信
  });
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
