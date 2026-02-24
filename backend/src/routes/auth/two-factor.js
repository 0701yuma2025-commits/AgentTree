/**
 * 2段階認証（メール方式）API
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { loginRateLimit } = require('../../middleware/rateLimiter');
const { sendEmail } = require('../../utils/emailSender');

/**
 * 6桁の認証コードを生成
 */
function generate6DigitCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

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

    // 有効期限チェック（bcrypt計算を省略するため先にチェック）
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています。再度有効化をお試しください。'
      });
    }

    // コード検証（bcryptで比較）
    const isValid = await bcrypt.compare(code, user.two_factor_secret);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
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
    const hashedCode = await bcrypt.hash(code, 10);

    // データベースに一時保存（ハッシュ化して保存）
    const { error: updateError } = await supabase
      .from('users')
      .update({
        two_factor_secret: hashedCode,
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

    // 有効期限チェック（bcrypt計算を省略するため先にチェック）
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています'
      });
    }

    // コード検証（bcryptで比較）
    const isValidCode = await bcrypt.compare(code, user.two_factor_secret);
    if (!isValidCode) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
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
router.post('/login/2fa/email', loginRateLimit, async (req, res) => {
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

    // 有効期限チェック（bcrypt計算を省略するため先にチェック）
    const expiresAt = new Date(user.two_factor_verified_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: '認証コードの有効期限が切れています'
      });
    }

    // コード検証（bcryptで比較）
    const isValidCode = await bcrypt.compare(code, user.two_factor_secret);
    if (!isValidCode) {
      return res.status(401).json({
        success: false,
        message: '認証コードが正しくありません'
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
module.exports.generate6DigitCode = generate6DigitCode;
