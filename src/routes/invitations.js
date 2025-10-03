/**
 * 招待管理API
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

/**
 * GET /api/invitations
 * 招待一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = supabase
      .from('invitations')
      .select(`
        *,
        agencies:inviter_agency_id(company_name, tier_level)
      `)
      .order('created_at', { ascending: false });

    // 代理店ユーザーは自分が作成した招待のみ
    if (req.user.role === 'agency') {
      query = query.eq('created_by', req.user.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * POST /api/invitations
 * 招待作成
 */
router.post('/',
  authenticateToken,
  [
    body('agency_id').isUUID().withMessage('代理店IDが不正です'),
    body('email').isEmail().withMessage('有効なメールアドレスを入力してください')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: errors.array()[0].msg
        });
      }

      const { agency_id, email } = req.body;

      // 招待者の代理店情報を取得（親代理店として使用）
      let parentAgencyId = null;
      if (req.user.role === 'agency' && req.user.agency) {
        parentAgencyId = req.user.agency.id;
      }

      // 招待作成（Supabase Function経由）
      const { data, error } = await supabase
        .rpc('create_invitation', {
          p_agency_id: agency_id,
          p_email: email,
          p_created_by: req.user.id,
          p_parent_agency_id: parentAgencyId  // 親代理店IDを追加
        });

      if (error) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: true,
            message: 'この招待は既に存在します'
          });
        }
        throw error;
      }

      // メール送信（Resend経由）
      if (data && data.token) {
        await sendInvitationEmail(data);
      }

      res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Create invitation error:', error);
      res.status(500).json({
        error: true,
        message: '招待の作成に失敗しました'
      });
    }
  }
);

/**
 * GET /api/invitations/validate/:token
 * トークン検証
 */
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data, error } = await supabase
      .rpc('validate_invitation', { p_token: token });

    if (error || !data) {
      return res.status(400).json({
        error: true,
        message: '無効または期限切れの招待です'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({
      error: true,
      message: 'トークンの検証に失敗しました'
    });
  }
});

/**
 * POST /api/invitations/accept
 * 招待受諾
 */
router.post('/accept',
  [
    body('token').notEmpty().withMessage('トークンは必須です'),
    body('password').isLength({ min: 8 }).withMessage('パスワードは8文字以上必要です'),
    body('full_name').notEmpty().withMessage('氏名は必須です')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: errors.array()[0].msg
        });
      }

      const { token, password, full_name } = req.body;

      // トークン検証
      const { data: inviteData } = await supabase
        .rpc('validate_invitation', { p_token: token });

      if (!inviteData) {
        return res.status(400).json({
          error: true,
          message: '無効または期限切れの招待です'
        });
      }

      // ユーザー作成
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteData.email,
        password: password,
        options: {
          data: {
            full_name: full_name,
            role: 'agency'
          }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return res.status(409).json({
            error: true,
            message: 'このメールアドレスは既に登録されています'
          });
        }
        throw authError;
      }

      // 招待を受諾済みにマーク
      const { error: acceptError } = await supabase
        .rpc('accept_invitation', {
          p_token: token,
          p_password: password,
          p_full_name: full_name
        });

      if (acceptError) throw acceptError;

      res.json({
        success: true,
        message: '登録が完了しました',
        user_id: authData.user?.id
      });
    } catch (error) {
      console.error('Accept invitation error:', error);
      res.status(500).json({
        error: true,
        message: '招待の受諾に失敗しました'
      });
    }
  }
);

/**
 * 招待メール送信（内部関数）
 */
async function sendInvitationEmail(invitation) {
  try {
    // 親代理店の名前を取得
    let parentAgencyName = '営業代理店管理システム';
    if (invitation.parent_agency_id) {
      const { data: parentAgency } = await supabase
        .from('agencies')
        .select('company_name')
        .eq('id', invitation.parent_agency_id)
        .single();
      if (parentAgency) {
        parentAgencyName = parentAgency.company_name;
      }
    }

    // Resend経由でメール送信
    const result = await emailService.sendInvitationEmail({
      email: invitation.email,
      parent_agency_name: parentAgencyName,
      invitation_code: invitation.token
    });

    if (!result.success) {
      console.error('Failed to send invitation email:', result.error);
    }
  } catch (error) {
    console.error('Send invitation email error:', error);
  }
}

module.exports = router;