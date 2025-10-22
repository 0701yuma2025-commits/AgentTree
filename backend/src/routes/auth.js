/**
 * 認証ルーター
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { validatePassword, checkPasswordSimilarity } = require('../utils/passwordValidator');
const { loginRateLimit, passwordResetRateLimit } = require('../middleware/rateLimiter');
const { logLogin, logLogout } = require('../middleware/auditLog');

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
        error: true,
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
        error: true,
        message: 'メールアドレスまたはパスワードが間違っています'
      });
    }

    // ユーザー情報取得 - IDまたはメールで検索
    let { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .or(`id.eq.${authData.user.id},email.eq.${email}`)
      .single();

    console.log('Login Debug - User Profile:', userProfile);
    console.log('Login Debug - Auth User ID:', authData.user.id);
    console.log('Login Debug - Email:', email);

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
            tierLevel = parentAgency.tier_level + 1;
            parentAgencyId = invitation.parent_agency_id;
          }
        }

        // 新規代理店を作成
        const agencyCode = 'AG' + Date.now().toString().slice(-6);  // 簡易的な代理店コード生成

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
          console.log('Agency auto-created:', newAgency);
          userAgency = newAgency;
        }
      } else {
        userAgency = existingAgency;
      }
    }

    console.log('Login Success - Final Role:', finalRole);
    console.log('Login Success - User Email:', email);
    console.log('Login Success - User Agency:', userAgency);
    console.log('Login Debug - 2FA Enabled:', userProfile.two_factor_enabled);

    // 2FA有効チェック
    if (userProfile.two_factor_enabled) {
      console.log('[2FA] ログイン時2FA処理開始');

      // メール2FA用の認証コードを生成して送信
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分後

      console.log('[2FA] 認証コード生成完了:', code);

      // データベースに一時保存
      const { error: updateError } = await supabase
        .from('users')
        .update({
          two_factor_secret: code,
          two_factor_verified_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userProfile.id);

      if (updateError) {
        console.error('[2FA] DB更新エラー:', updateError);
      } else {
        console.log('[2FA] DB更新成功');
      }

      // メール送信（認証コードのみ）
      try {
        console.log('[2FA] メール送信開始 to:', email);
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
        console.log('[2FA] メール送信完了');
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

    console.log('[2FA] 2FA無効のため通常ログイン');

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
      error: true,
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
      error: true,
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
        error: true,
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
        error: true,
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
      error: true,
      message: 'トークンの更新に失敗しました'
    });
  }
});

/**
 * メールアドレス変更
 */
router.put('/change-email', authenticateToken, async (req, res) => {
  try {
    const { new_email, password } = req.body;
    const userId = req.user.id;

    // 入力検証
    if (!new_email || !password) {
      return res.status(400).json({
        success: false,
        message: '新しいメールアドレスとパスワードは必須です'
      });
    }

    // メールアドレス形式検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(new_email)) {
      return res.status(400).json({
        success: false,
        message: '有効なメールアドレスを入力してください'
      });
    }

    // 現在のユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    // パスワード確認
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'パスワードが正しくありません'
      });
    }

    // メールアドレスの重複チェック
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', new_email)
      .neq('id', userId)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'このメールアドレスは既に使用されています'
      });
    }

    // メールアドレスを更新
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email: new_email,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    // TODO: 確認メールを送信する処理を追加
    // await sendEmailConfirmation(new_email, user.full_name);

    res.json({
      success: true,
      message: 'メールアドレスを変更しました'
    });

  } catch (error) {
    console.error('Change email error:', error);
    res.status(500).json({
      success: false,
      message: 'メールアドレスの変更に失敗しました'
    });
  }
});

/**
 * パスワード変更
 */
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    // 入力検証
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: '現在のパスワードと新しいパスワードは必須です'
      });
    }

    // 強化されたパスワード検証
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'パスワードが要件を満たしていません',
        errors: passwordValidation.errors,
        strength: passwordValidation.strength
      });
    }

    // 現在のユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    // Supabase Auth APIでパスワード確認と変更
    // まず現在のパスワードで認証を試みる
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current_password
    });

    if (signInError) {
      return res.status(401).json({
        success: false,
        message: '現在のパスワードが正しくありません'
      });
    }

    // パスワードを更新（Supabase Auth API使用）
    const { error: updateError } = await supabase.auth.updateUser({
      password: new_password
    });

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'パスワードを変更しました'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'パスワードの変更に失敗しました'
    });
  }
});

/**
 * パスワードリセットリクエスト（メール送信）（レート制限適用）
 */
router.post('/reset-password-request', passwordResetRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスは必須です'
      });
    }

    // Supabaseのパスワードリセット機能を使用
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`
    });

    if (error) {
      console.error('Password reset request error:', error);
      // セキュリティのため、常に成功メッセージを返す
    }

    // セキュリティのため、メールアドレスが存在するかどうかに関わらず同じメッセージを返す
    res.json({
      success: true,
      message: 'パスワードリセットメールを送信しました。メールをご確認ください。'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'パスワードリセットリクエストの処理に失敗しました'
    });
  }
});

/**
 * パスワードリセット実行（新しいパスワードの設定）
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'トークンと新しいパスワードは必須です'
      });
    }

    // 強化されたパスワード検証
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'パスワードが要件を満たしていません',
        errors: passwordValidation.errors,
        strength: passwordValidation.strength
      });
    }

    // Supabaseのパスワードリセット機能を使用
    const { error } = await supabase.auth.updateUser({
      password: new_password
    });

    if (error) {
      console.error('Password reset error:', error);
      return res.status(400).json({
        success: false,
        message: 'パスワードのリセットに失敗しました'
      });
    }

    res.json({
      success: true,
      message: 'パスワードをリセットしました'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'パスワードリセットの処理に失敗しました'
    });
  }
});

/**
 * POST /api/auth/set-password
 * パスワード設定（代理店承認後の初回ログイン用）
 */
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    console.log('Set password request:', { token: token?.substring(0, 10) + '...', hasPassword: !!password });

    // 入力検証
    if (!token || !password) {
      console.log('Missing token or password');
      return res.status(400).json({
        success: false,
        message: 'トークンとパスワードは必須です'
      });
    }

    // パスワード強度検証
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      console.log('Password validation failed:', passwordValidation.errors);
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors.join(', ')
      });
    }

    // トークンで代理店を検索
    const { data: agencies, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('password_reset_token', token);

    console.log('Agency lookup result:', {
      found: agencies && agencies.length > 0,
      count: agencies?.length,
      error: agencyError?.message
    });

    if (agencyError) {
      console.error('Database error:', agencyError);
      return res.status(500).json({
        success: false,
        message: 'データベースエラーが発生しました'
      });
    }

    if (!agencies || agencies.length === 0) {
      return res.status(400).json({
        success: false,
        message: '無効なトークン'
      });
    }

    if (agencies.length > 1) {
      console.error('Multiple agencies with same token:', agencies.length);
      return res.status(500).json({
        success: false,
        message: 'システムエラー：重複したトークンが見つかりました'
      });
    }

    const agency = agencies[0];

    // トークンの有効期限確認
    const tokenExpiry = new Date(agency.password_reset_expiry);
    if (tokenExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'トークンの有効期限が切れています。管理者にお問い合わせください。'
      });
    }

    // Supabase Authでユーザーを作成または更新
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: agency.contact_email,
      password: password,
      email_confirm: true
    });

    if (authError && authError.message !== 'User already exists') {
      // ユーザーが既に存在する場合はパスワードを更新
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        authUser?.id || agency.user_id,
        { password }
      );

      if (updateError) {
        console.error('Password update error:', updateError);
        return res.status(500).json({
          success: false,
          message: 'パスワード設定に失敗しました'
        });
      }
    }

    const userId = authUser?.id || agency.user_id;

    // usersテーブルにレコードを作成または更新
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: agency.contact_email,
        full_name: agency.representative_name,
        password_hash: 'managed_by_supabase',
        role: 'agency',
        is_active: true,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (userError) {
      console.error('User creation error:', userError);
    }

    // 代理店のuser_idとトークンをクリア
    const { error: updateAgencyError } = await supabase
      .from('agencies')
      .update({
        user_id: userId,
        password_reset_token: null,
        password_reset_expiry: null
      })
      .eq('id', agency.id);

    if (updateAgencyError) {
      console.error('Agency update error:', updateAgencyError);
    }

    res.json({
      success: true,
      message: 'パスワードが設定されました'
    });

  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({
      success: false,
      message: 'パスワード設定に失敗しました'
    });
  }
});

/**
 * ============================================
 * 2段階認証（メール方式のみ）
 * ============================================
 */

/**
 * GET /api/auth/2fa/status
 * 2FA有効化状態確認
 */
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('two_factor_enabled, two_factor_verified_at')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    res.json({
      success: true,
      data: {
        enabled: user.two_factor_enabled || false,
        verified_at: user.two_factor_verified_at
      }
    });

  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({
      success: false,
      message: '2FAステータスの取得に失敗しました'
    });
  }
});

/**
 * ============================================
 * メール2段階認証API
 * ============================================
 */

// メール送信用ユーティリティをインポート（後で作成）
const { sendEmail } = require('../utils/emailSender');

/**
 * 6桁の認証コードを生成
 */
function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/2fa/email/enable
 * メール2FA有効化（パスワード確認のみ）
 */
router.post('/2fa/email/enable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'パスワードは必須です'
      });
    }

    // ユーザー情報取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('two_factor_enabled, full_name, email')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    if (user.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FAは既に有効化されています'
      });
    }

    // パスワード確認
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    });

    if (signInError) {
      return res.status(401).json({
        success: false,
        message: 'パスワードが正しくありません'
      });
    }

    // 2FAを即座に有効化
    const { error: updateError } = await supabase
      .from('users')
      .update({
        two_factor_enabled: true,
        two_factor_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: '2FAを有効化しました'
    });

  } catch (error) {
    console.error('Enable 2FA email error:', error);
    res.status(500).json({
      success: false,
      message: '2FAの有効化に失敗しました'
    });
  }
});

/**
 * POST /api/auth/2fa/email/verify
 * メール認証コード検証（2FA有効化）
 */
router.post('/2fa/email/verify', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: '認証コードは必須です'
      });
    }

    // ユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('two_factor_secret, two_factor_verified_at, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    if (user.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FAは既に有効化されています'
      });
    }

    // コード検証
    if (user.two_factor_secret !== code) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
      });
    }

    // 有効期限チェック
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています。再度有効化をお試しください。'
      });
    }

    // 2FAを有効化
    const { error: updateError } = await supabase
      .from('users')
      .update({
        two_factor_enabled: true,
        two_factor_secret: null, // コードをクリア
        two_factor_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: '2FAが有効化されました'
    });

  } catch (error) {
    console.error('Verify 2FA email error:', error);
    res.status(500).json({
      success: false,
      message: '2FAの検証に失敗しました'
    });
  }
});

/**
 * POST /api/auth/2fa/email/disable/request
 * メール2FA無効化リクエスト（認証コードをメール送信）
 */
router.post('/2fa/email/disable/request', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    // ユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('two_factor_enabled, full_name')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    if (!user.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FAは有効化されていません'
      });
    }

    // 6桁の認証コードを生成
    const code = generate6DigitCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分後

    // データベースに一時保存
    const { error: updateError } = await supabase
      .from('users')
      .update({
        two_factor_secret: code,
        two_factor_verified_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    // メール送信（認証コードのみ）
    await sendEmail({
      to: email,
      subject: '2FA無効化 認証コード',
      html: `
        <h2>2FA無効化 認証コード</h2>
        <p>${user.full_name || 'ユーザー'}様</p>
        <h1 style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px;">${code}</h1>
        <p>有効期限: 5分</p>
      `
    });

    res.json({
      success: true,
      message: '認証コードをメールで送信しました'
    });

  } catch (error) {
    console.error('Request disable 2FA code error:', error);
    res.status(500).json({
      success: false,
      message: '認証コードの送信に失敗しました'
    });
  }
});

/**
 * POST /api/auth/2fa/email/disable/verify
 * メール2FA無効化検証（認証コードで無効化）
 */
router.post('/2fa/email/disable/verify', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: '認証コードは必須です'
      });
    }

    // ユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, two_factor_enabled, two_factor_secret, two_factor_verified_at, full_name')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    if (!user.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FAは有効化されていません'
      });
    }

    // コード検証
    if (user.two_factor_secret !== code) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
      });
    }

    // 有効期限チェック
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています'
      });
    }

    // 2FAを無効化
    const { error: updateError } = await supabase
      .from('users')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_verified_at: null,
        backup_codes: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    // メール通知
    await sendEmail({
      to: user.email,
      subject: '【重要】2段階認証が無効化されました',
      html: `
        <h2>2段階認証が無効化されました</h2>
        <p>こんにちは、${user.full_name || 'ユーザー'}様</p>
        <p>あなたのアカウントの2段階認証が無効化されました。</p>
        <p><strong>もしこの操作に心当たりがない場合は、直ちにパスワードを変更し、管理者に連絡してください。</strong></p>
        <p>日時: ${new Date().toLocaleString('ja-JP')}</p>
      `
    });

    res.json({
      success: true,
      message: '2FAを無効化しました'
    });

  } catch (error) {
    console.error('Verify disable 2FA code error:', error);
    res.status(500).json({
      success: false,
      message: '2FAの無効化に失敗しました'
    });
  }
});

/**
 * POST /api/auth/login/2fa/email
 * ログイン時のメール2FA検証
 */
router.post('/login/2fa/email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスと認証コードは必須です'
      });
    }

    // ユーザー情報を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, role, full_name, two_factor_secret, two_factor_enabled, two_factor_verified_at')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    if (!user.two_factor_enabled) {
      return res.status(400).json({
        success: false,
        message: '2FAが有効化されていません'
      });
    }

    // コード検証
    if (user.two_factor_secret !== code) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
      });
    }

    // 有効期限チェック（ログイン用コードは5分）
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています'
      });
    }

    // コードを使用済みにする
    await supabase
      .from('users')
      .update({
        two_factor_secret: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // JWTトークン生成
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // リフレッシュトークン生成
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    const refreshToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    // 代理店情報を取得
    let userAgency = null;
    if (user.role === 'agency' || user.role === 'admin') {
      const { data: agency } = await supabase
        .from('agencies')
        .select('*')
        .eq('email', email)
        .single();

      if (agency) {
        userAgency = agency;
      }
    }

    res.json({
      success: true,
      token: jwtToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        agency: userAgency
      },
      message: '2FA認証が成功しました'
    });

  } catch (error) {
    console.error('2FA email login error:', error);
    res.status(500).json({
      success: false,
      message: 'メール2FA認証に失敗しました'
    });
  }
});

module.exports = router;