/**
 * 認証ルーター
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/rateLimiter');
const { logLogin, logLogout } = require('../middleware/auditLog');
const { generateAgencyCode } = require('../utils/generateCode');
const { generate6DigitCode } = require('./auth/two-factor');

// サブルーターマウント
router.use('/', require('./auth/account'));
router.use('/', require('./auth/two-factor'));

/**
 * POST /api/auth/login
 * ユーザーログイン（レート制限適用）
 */
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 入力検証
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスとパスワードは必須です'
      });
    }

    // Supabase認証
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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
      // ユーザーがない場合は作成
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: email,
          password_hash: 'managed_by_supabase',
          role: 'agency',
          full_name: authData.user.user_metadata?.full_name || email.split('@')[0],
          is_active: true,
          last_login_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Create user error:', createError);
        // エラーでもログインは許可（Supabase認証は成功しているため）
        userProfile = {
          id: authData.user.id,
          email: email,
          role: 'agency',
          full_name: email.split('@')[0]
        };
      } else {
        userProfile = newUser;
      }
    } else {
      // 最終ログイン時刻を更新
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userProfile.id);
    }

    // JWTトークン生成（環境変数の必須チェック）
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const token = jwt.sign(
      {
        id: authData.user.id,
        email: email,
        role: userProfile.role || 'agency'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // リフレッシュトークン生成（環境変数の必須チェック）
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    const refreshToken = jwt.sign(
      {
        id: authData.user.id,
        email: email,
        role: userProfile.role || 'agency'
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    // 明示的に role を返す
    const finalRole = userProfile.role || 'agency';

    // 代理店情報を格納する変数
    let userAgency = null;

    // 代理店ユーザーの場合、代理店が存在しない場合は作成
    if (finalRole === 'agency' || finalRole === 'admin') {
      const { data: existingAgency } = await supabase
        .from('agencies')
        .select('*')
        .eq('email', email)
        .single();

      if (!existingAgency) {
        // 招待情報から親代理店を取得
        const { data: invitation } = await supabase
          .from('invitations')
          .select('parent_agency_id')
          .eq('email', email)
          .single();

        // 親代理店のtier_levelを取得
        let tierLevel = 1;  // デフォルトはTier1
        let parentAgencyId = null;

        if (invitation?.parent_agency_id) {
          const { data: parentAgency } = await supabase
            .from('agencies')
            .select('tier_level')
            .eq('id', invitation.parent_agency_id)
            .single();

          if (parentAgency) {
            // Tier4の下には代理店を作成できない
            if (parentAgency.tier_level >= 4) {
              await logLogin({ email }, req, false);
              return res.status(400).json({
                success: false,
                message: 'これ以上階層を作成できません。最大Tier4までです。'
              });
            }

            tierLevel = parentAgency.tier_level + 1;
            parentAgencyId = invitation.parent_agency_id;
          }
        }

        // 新規代理店を作成
        const agencyCode = await generateAgencyCode();

        const { data: newAgency, error: agencyError } = await supabase
          .from('agencies')
          .insert({
            agency_code: agencyCode,
            company_name: userProfile.full_name || email.split('@')[0] + '代理店',
            company_type: '個人',
            representative_name: userProfile.full_name || email.split('@')[0],
            contact_email: email,
            email: email,  // 1代理店1ユーザー用のemailフィールド
            tier_level: tierLevel,
            parent_agency_id: parentAgencyId,
            status: 'active'
          })
          .select()
          .single();

        if (!agencyError && newAgency) {
          // Agency auto-created
          userAgency = newAgency;
        }
      } else {
        userAgency = existingAgency;
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
        console.error('[2FA] DB更新エラー:', updateError);
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
        console.error('[2FA] メール送信エラー:', emailError);
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

    // 2FAが無効な場合は通常通りトークンを返す
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: userProfile.id || authData.user.id,
        email: email,
        role: finalRole, // 明示的にロールを設定
        full_name: userProfile.full_name || email.split('@')[0],
        agency: userAgency // 代理店情報を追加
      }
    });

  } catch (error) {
    console.error('Login error:', error);
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

    await supabase.auth.signOut();
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
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
    const { refreshToken } = req.body;

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
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (verifyError) {
      console.error('Refresh token verification error:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'リフレッシュトークンが無効です'
      });
    }

    // 新しいアクセストークン生成（環境変数の必須チェック）
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const newToken = jwt.sign(
      {
        id: decoded.id || decoded.userId,  // 両方のフィールドに対応
        email: decoded.email,
        role: decoded.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token: newToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'トークンの更新に失敗しました'
    });
  }
});

module.exports = router;
