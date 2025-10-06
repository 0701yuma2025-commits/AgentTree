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
router.post('/logout', async (req, res) => {
  try {
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

module.exports = router;