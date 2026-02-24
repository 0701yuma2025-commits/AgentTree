/**
 * アカウント管理API（メール変更、パスワード変更・リセット）
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { validatePassword } = require('../../utils/passwordValidator');
const { passwordResetRateLimit } = require('../../middleware/rateLimiter');
const { generateAgencyCode } = require('../../utils/generateCode');

/**
 * メールアドレス変更
 */
router.put('/change-email', passwordResetRateLimit, authenticateToken, async (req, res) => {
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
router.put('/change-password', passwordResetRateLimit, authenticateToken, async (req, res) => {
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
router.post('/set-password', passwordResetRateLimit, async (req, res) => {
  try {
    const { token, password } = req.body;

    // 入力検証
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'トークンとパスワードは必須です'
      });
    }

    // パスワード強度検証
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
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
