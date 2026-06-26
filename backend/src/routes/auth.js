/**
 * 認証ルーター
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/rateLimiter');
const { logLogin, logLogout } = require('../middleware/auditLog');
const { generate6DigitCode } = require('./auth/two-factor');
const { setTokenCookie, setRefreshTokenCookie, clearAuthCookies } = require('../utils/cookieHelper');
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('auth-routes');

// signInWithPassword専用の認証クライアント（共有クライアントのセッション汚染を防止）
function createAuthClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// サブルーターマウント
router.use('/', require('./auth/account'));
router.use('/', require('./auth/two-factor'));

/**
 * POST /api/auth/login
 * ユーザーログイン（レート制限適用）
 */
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password, remember_me } = req.body;

    // 入力検証
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスとパスワードは必須です'
      });
    }

    // Supabase認証（専用クライアントで実行し、共有クライアントのセッションを汚染しない）
    const authClient = createAuthClient();
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      // ログイン失敗を記録
      await logLogin({ email }, req, false);

      return res.status(401).json({
        success: false,
        message: 'メールアドレスまたはパスワードが間違っています'
      });
    }

    // ユーザー情報取得 - まずIDで検索、なければメールで検索
    let { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !userProfile) {
      const { data: emailProfile, error: emailError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      if (!emailError && emailProfile) {
        userProfile = emailProfile;
        profileError = null;
      }
    }

    if (profileError || !userProfile) {
      // プロファイルが存在しない = 正規の招待/承認フローを経ていない。
      // ログイン時の自動作成は承認バイパスになるため行わず、明示的に拒否する。
      await logLogin({ email }, req, false);
      return res.status(403).json({
        success: false,
        message: 'このアカウントはまだ登録が完了していません。管理者にお問い合わせください。'
      });
    }

    // 最終ログイン時刻を更新
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userProfile.id);

    // JWTトークン生成（環境変数の必須チェック）
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    // remember_me に応じてトークン有効期限を設定
    const accessTokenExpiry = remember_me ? '30d' : '1d';
    const refreshTokenExpiry = remember_me ? '30d' : '1d';

    const token = jwt.sign(
      {
        id: authData.user.id,
        email: email,
        role: userProfile.role || 'agency',
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: accessTokenExpiry, issuer: 'agenttree', audience: 'agenttree-api' }
    );

    // リフレッシュトークン生成（環境変数の必須チェック）
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    const refreshToken = jwt.sign(
      {
        id: authData.user.id,
        email: email,
        role: userProfile.role || 'agency',
        // refresh時にアクセストークンの有効期限を元セッションの remember_me に揃えるためフラグを保持
        remember_me: !!remember_me,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: refreshTokenExpiry, issuer: 'agenttree', audience: 'agenttree-api' }
    );

    // 明示的に role を返す
    const finalRole = userProfile.role || 'agency';

    // 代理店情報を格納する変数
    let userAgency = null;

    // 既存の代理店情報を取得する（ログイン時の自動作成は承認バイパスになるため行わない）。
    // 認可キーは user_id を優先し、旧データ(user_id未設定)は email でフォールバック。
    if (finalRole === 'agency' || finalRole === 'admin') {
      const { data: agencyByUserId } = await supabase
        .from('agencies')
        .select('*')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      userAgency = agencyByUserId || null;

      if (!userAgency) {
        const { data: agencyByEmail } = await supabase
          .from('agencies')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        userAgency = agencyByEmail || null;
      }
    }

    // 2FA有効チェック
    if (userProfile.two_factor_enabled) {

      // メール2FA用の認証コードを生成して送信
      const code = generate6DigitCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分後
      const hashedCode = await bcrypt.hash(code, 10);

      // データベースに一時保存（ハッシュ化して保存）
      const { error: updateError } = await supabase
        .from('users')
        .update({
          two_factor_secret: hashedCode,
          two_factor_verified_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userProfile.id);

      if (updateError) {
        logger.error('[2FA] DB更新エラー:', updateError.message);
      }

      // メール送信（認証コードのみ）
      try {
        const { sendEmail } = require('../utils/emailSender');
        await sendEmail({
          to: email,
          subject: 'ログイン認証コード',
          html: `
            <h2>ログイン認証コード</h2>
            <p>${userProfile.full_name || 'ユーザー'}様</p>
            <h1 style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px;">${code}</h1>
            <p>有効期限: 5分</p>
          `
        });
      } catch (emailError) {
        logger.error('[2FA] メール送信エラー:', emailError.message);
        // エラーが発生してもログインは続行
      }

      // 2FAが有効な場合は、トークンを発行せずに2FA要求を返す
      return res.json({
        success: true,
        requires2FA: true,
        user: {
          id: userProfile.id || authData.user.id,
          email: email,
          two_factor_enabled: true
        },
        message: '2段階認証が必要です。メールに認証コードを送信しました。'
      });
    }

    // ログイン成功を記録
    await logLogin({
      id: userProfile.id || authData.user.id,
      email: email,
      role: finalRole
    }, req, true);

    // httpOnly Cookieにトークンを設定（XSS対策）
    const cookieOptions = { rememberMe: !!remember_me };
    setTokenCookie(res, token, cookieOptions);
    setRefreshTokenCookie(res, refreshToken, cookieOptions);

    // トークンはhttpOnly Cookieのみで管理（レスポンスbodyには含めない）
    res.json({
      success: true,
      user: {
        id: userProfile.id || authData.user.id,
        email: email,
        role: finalRole,
        full_name: userProfile.full_name || email.split('@')[0],
        agency: userAgency
      }
    });

  } catch (error) {
    logger.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'ログイン処理中にエラーが発生しました'
    });
  }
});

/**
 * POST /api/auth/logout
 * ログアウト
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // ログアウトを記録
    await logLogout(req.user, req);

    // httpOnly Cookieをクリア
    clearAuthCookies(res);

    await supabase.auth.signOut();
    res.json({ success: true });
  } catch (error) {
    logger.error('Logout error:', error.message);
    res.status(500).json({
      success: false,
      message: 'ログアウトに失敗しました'
    });
  }
});

/**
 * POST /api/auth/refresh
 * トークンリフレッシュ
 */
router.post('/refresh', async (req, res) => {
  try {
    // Cookie → リクエストボディの順でリフレッシュトークンを取得
    const refreshToken = req.cookies?.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'リフレッシュトークンが必要です'
      });
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    // JWT検証を安全に実行
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
        issuer: 'agenttree',
        audience: 'agenttree-api'
      });
    } catch (verifyError) {
      logger.error('Refresh token verification error:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'リフレッシュトークンが無効です'
      });
    }

    // トークンタイプの検証（access tokenの流用を防止）
    if (decoded.type && decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'リフレッシュトークンではありません'
      });
    }

    // 新しいアクセストークン生成（環境変数の必須チェック）
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'リフレッシュトークンが無効です'
      });
    }

    // 最新のロール・状態をDBから取得（JWTのroleは信頼しない）。
    // 降格(admin→agency)やアカウント無効化を反映し、古い権限・有効期限を焼き直さない。
    // 取得不能なら fail-closed（再発行しない）。
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'アカウントが無効です。再度ログインしてください。'
      });
    }

    // 明示的に無効化されたアカウントは拒否（is_active未設定の旧データは許可）
    if (userProfile.is_active === false) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'このアカウントは無効化されています。'
      });
    }

    const role = userProfile.role || 'agency';
    const email = userProfile.email || decoded.email;

    // 代理店ユーザーは停止/解約状態を再チェック（user_id優先→emailフォールバック）
    if (role === 'agency') {
      let agency = null;
      const { data: agencyByUserId } = await supabase
        .from('agencies')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      agency = agencyByUserId || null;
      if (!agency && email) {
        const { data: agencyByEmail } = await supabase
          .from('agencies')
          .select('status')
          .eq('email', email)
          .maybeSingle();
        agency = agencyByEmail || null;
      }
      if (agency && agency.status === 'terminated') {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_TERMINATED',
          message: 'このアカウントは解約されています。'
        });
      }
      if (agency && agency.status === 'suspended') {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_SUSPENDED',
          message: 'このアカウントは停止されています。'
        });
      }
    }

    // 元セッションの remember_me を踏襲（一方的な期限延長を防止。
    // 旧トークンにフラグが無い場合は短い方(1d)にフォールバック）。
    const rememberMe = !!decoded.remember_me;
    const accessTokenExpiry = rememberMe ? '30d' : '1d';

    const newToken = jwt.sign(
      {
        id: userId,
        email: email,
        role: role,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: accessTokenExpiry, issuer: 'agenttree', audience: 'agenttree-api' }
    );

    // 新しいアクセストークンをhttpOnly Cookieに設定（cookieのmaxAgeもremember_meに揃える）
    setTokenCookie(res, newToken, { rememberMe });

    // トークンはhttpOnly Cookieのみ（bodyには含めない）
    res.json({
      success: true
    });

  } catch (error) {
    logger.error('Token refresh error:', error.message);
    res.status(401).json({
      success: false,
      message: 'トークンの更新に失敗しました'
    });
  }
});

module.exports = router;
