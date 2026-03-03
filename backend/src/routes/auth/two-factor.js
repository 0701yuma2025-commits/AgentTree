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
const { setTokenCookie, setRefreshTokenCookie } = require('../../utils/cookieHelper');

/**
 * 6桁の認証コードを生成
 */
function generate6DigitCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * 2FA検証のブルートフォース対策
 * - 最大試行回数を超えるとコードを無効化しロックアウト
 * - ロックアウト期間中は検証を拒否
 */
const MAX_2FA_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15分
const twoFactorAttempts = new Map(); // key: email/userId → { count, lockedUntil }

function check2FABruteForce(identifier) {
  const record = twoFactorAttempts.get(identifier);
  if (!record) return { allowed: true };

  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remainingSec };
  }

  // ロックアウト期間が過ぎていればリセット
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    twoFactorAttempts.delete(identifier);
    return { allowed: true };
  }

  return { allowed: true };
}

function record2FAFailure(identifier) {
  const record = twoFactorAttempts.get(identifier) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= MAX_2FA_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  twoFactorAttempts.set(identifier, record);
  return record.count >= MAX_2FA_ATTEMPTS;
}

function reset2FAAttempts(identifier) {
  twoFactorAttempts.delete(identifier);
}

// 古いエントリを定期クリーンアップ（メモリリーク防止）
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of twoFactorAttempts) {
    if (record.lockedUntil && record.lockedUntil < now - LOCKOUT_DURATION_MS) {
      twoFactorAttempts.delete(key);
    }
  }
}, 10 * 60 * 1000); // 10分ごと
cleanupInterval.unref(); // プロセス終了を阻害しない

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
    if (!user.two_factor_secret) {
      return res.status(401).json({ success: false, message: '認証コードが無効または既に使用されています' });
    }
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

    // ブルートフォースチェック
    const identifier = `disable:${userId}`;
    const bruteForceCheck = check2FABruteForce(identifier);
    if (!bruteForceCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `認証試行回数の上限に達しました。${bruteForceCheck.remainingSec}秒後にお試しください。`
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
    if (!user.two_factor_secret) {
      return res.status(401).json({ success: false, message: '認証コードが無効または既に使用されています' });
    }
    const isValidCode = await bcrypt.compare(code, user.two_factor_secret);
    if (!isValidCode) {
      const locked = record2FAFailure(identifier);
      if (locked) {
        await supabase.from('users').update({
          two_factor_secret: null,
          updated_at: new Date().toISOString()
        }).eq('id', userId);

        return res.status(429).json({
          success: false,
          message: '認証試行回数の上限に達しました。再度コードを送信してください。'
        });
      }
      return res.status(401).json({
        success: false,
        message: `認証コードが正しくありません（残り${MAX_2FA_ATTEMPTS - (twoFactorAttempts.get(identifier)?.count || 0)}回）`
      });
    }

    // 検証成功 → 試行回数をリセット
    reset2FAAttempts(identifier);

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

    // ブルートフォースチェック
    const bruteForceCheck = check2FABruteForce(email);
    if (!bruteForceCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `認証試行回数の上限に達しました。${bruteForceCheck.remainingSec}秒後にお試しください。`
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
    if (!user.two_factor_secret) {
      return res.status(401).json({ success: false, message: '認証コードが無効または既に使用されています' });
    }
    const isValidCode = await bcrypt.compare(code, user.two_factor_secret);
    if (!isValidCode) {
      // 失敗回数を記録し、上限到達時はコードを無効化
      const locked = record2FAFailure(email);
      if (locked) {
        // コードを無効化して再送を強制
        await supabase.from('users').update({
          two_factor_secret: null,
          updated_at: new Date().toISOString()
        }).eq('id', user.id);

        return res.status(429).json({
          success: false,
          message: '認証試行回数の上限に達しました。認証コードは無効化されました。再度ログインしてください。'
        });
      }
      return res.status(401).json({
        success: false,
        message: `認証コードが正しくありません（残り${MAX_2FA_ATTEMPTS - (twoFactorAttempts.get(email)?.count || 0)}回）`
      });
    }

    // 検証成功 → 試行回数をリセット
    reset2FAAttempts(email);

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

    // httpOnly Cookieにトークンを設定（XSS対策）
    setTokenCookie(res, jwtToken);
    setRefreshTokenCookie(res, refreshToken);

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
