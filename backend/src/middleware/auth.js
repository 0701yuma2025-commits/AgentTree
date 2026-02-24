/**
 * 認証ミドルウェア
 */

const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

/**
 * JWTトークン検証ミドルウェア
 */
const authenticateToken = async (req, res, next) => {
  // 全体を包括的なtry-catchで囲んでサーバークラッシュを防ぐ
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: true,
        message: '認証トークンが必要です'
      });
    }

    // JWT検証（常に署名を検証する）
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error('JWT verification error:', error.message);

      // エラー種別に応じて適切なレスポンスを返す
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: true,
          code: 'TOKEN_EXPIRED',
          message: 'トークンの有効期限が切れています。再ログインしてください。',
          expiredAt: error.expiredAt
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(403).json({
          error: true,
          code: 'INVALID_TOKEN',
          message: 'トークンが無効です'
        });
      } else if (error.name === 'NotBeforeError') {
        return res.status(403).json({
          error: true,
          code: 'TOKEN_NOT_ACTIVE',
          message: 'トークンがまだ有効になっていません',
          date: error.date
        });
      } else {
        return res.status(403).json({
          error: true,
          code: 'TOKEN_VERIFICATION_FAILED',
          message: 'トークンの認証に失敗しました'
        });
      }
    }

    // デコードされたユーザー情報を取得
    let id, email, role;
    try {
      ({ id, email, role } = decoded);
      if (!id || !email || !role) {
        return res.status(403).json({
          error: true,
          code: 'INVALID_TOKEN',
          message: 'トークンに必要な情報が含まれていません'
        });
      }
    } catch (error) {
      console.error('Token data extraction error:', error.message);
      return res.status(403).json({
        error: true,
        code: 'INVALID_TOKEN',
        message: 'トークンデータの取得に失敗しました'
      });
    }

    // usersテーブルから追加情報を取得（必要に応じて）
    try {
      const { data: userInfo, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (userError) {
        console.log('User lookup warning:', userError.message);
      }

      // req.userにユーザー情報を設定
      req.user = {
        id: id,
        email: email,
        role: role,
        ...userInfo
      };

      // 代理店ユーザーの場合は代理店情報も追加（メールベースで検索）
      if (req.user.role === 'agency' || req.user.email) {
        const { data: agency, error: agencyError } = await supabase
          .from('agencies')
          .select('*')
          .eq('email', req.user.email)  // メールアドレスで代理店を特定
          .single();

        if (agencyError) {
          console.log('Agency lookup warning:', agencyError.message);
        }

        if (agency) {
          req.user.agency = agency;
          req.user.agency_id = agency.id;  // agency_idも設定
        }
      }
    } catch (dbError) {
      console.error('Database lookup error:', dbError);
      // データベースエラーがあってもJWT認証は成功しているので続行
      req.user = {
        id: id,
        email: email,
        role: role
      };
    }

    next();
  } catch (error) {
    // どんなエラーでもサーバークラッシュを防ぐ
    console.error('認証処理の致命的エラー:', error.message);
    console.error('エラースタック:', error.stack);

    // 認証エラーとして統一的に処理
    return res.status(403).json({
      error: true,
      code: 'AUTH_FATAL_ERROR',
      message: '認証処理でエラーが発生しました'
    });
  }
};

/**
 * 管理者権限チェックミドルウェア
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({
      error: true,
      message: 'この操作には管理者権限が必要です'
    });
  }
  next();
};

/**
 * 代理店権限チェックミドルウェア
 */
const requireAgency = (req, res, next) => {
  if (!req.user || req.user.role !== 'agency') {
    return res.status(403).json({
      error: true,
      message: 'この操作には代理店権限が必要です'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireAgency
};