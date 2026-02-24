/**
 * 代理店ステータス管理API（承認、拒否、再有効化、停止）
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../../config/supabase');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const emailService = require('../../services/emailService');

/**
 * PUT /api/agencies/:id/approve
 * 代理店承認（管理者のみ）
 */
router.put('/:id/approve',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'pending') {
        return res.status(400).json({
          error: true,
          message: '承認待ちの代理店ではありません'
        });
      }

      // パスワード設定トークンを生成（24時間有効）
      const crypto = require('crypto');
      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'active',
          password_reset_token: passwordResetToken,
          password_reset_expiry: passwordResetExpiry
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 承認通知メールを送信（トークンを含む）
      emailService.sendAgencyApprovedEmail({ ...data, passwordResetToken })
        .catch(err => {
          console.error('承認メール送信エラー:', err.message);
        });

      res.json({
        success: true,
        data,
        message: '代理店を承認しました'
      });
    } catch (error) {
      console.error('Approve agency error:', error);
      res.status(500).json({
        error: true,
        message: '承認処理に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/reject
 * 代理店拒否（管理者のみ）
 */
router.put('/:id/reject',
  authenticateToken,
  requireAdmin,
  [
    body('rejection_reason').notEmpty().withMessage('拒否理由は必須です')
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

      const { id } = req.params;
      const { rejection_reason } = req.body;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'pending') {
        return res.status(400).json({
          error: true,
          message: '承認待ちの代理店ではありません'
        });
      }

      // rejectedステータスは存在しないため、suspendedを使用
      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'suspended',
          metadata: {
            ...((await supabase.from('agencies').select('metadata').eq('id', id).single()).data?.metadata || {}),
            rejection_reason: rejection_reason,
            rejected_at: new Date().toISOString(),
            rejected_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 却下通知メールを送信
      emailService.sendAgencyRejectedEmail(data, rejection_reason)
        .catch(err => {
          console.error('却下メール送信エラー:', err.message);
        });

      res.json({
        success: true,
        data,
        message: '代理店を拒否しました'
      });
    } catch (error) {
      console.error('Reject agency error:', error);
      res.status(500).json({
        error: true,
        message: '拒否処理に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/reactivate
 * 代理店再有効化（管理者のみ）
 */
router.put('/:id/reactivate',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status, metadata')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'suspended') {
        return res.status(400).json({
          error: true,
          message: '停止中の代理店ではありません'
        });
      }

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'active',
          metadata: {
            ...(currentAgency?.metadata || {}),
            reactivated_at: new Date().toISOString(),
            reactivated_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data,
        message: '代理店を再有効化しました'
      });
    } catch (error) {
      console.error('Reactivate agency error:', error);
      res.status(500).json({
        error: true,
        message: '再有効化に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/suspend
 * 代理店停止（管理者のみ）
 */
router.put('/:id/suspend',
  authenticateToken,
  requireAdmin,
  [
    body('suspension_reason').notEmpty().withMessage('停止理由は必須です')
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

      const { id } = req.params;
      const { suspension_reason } = req.body;

      // 既存のmetadataを取得
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('metadata')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'suspended',
          metadata: {
            ...(currentAgency?.metadata || {}),
            suspension_reason: suspension_reason,
            suspended_at: new Date().toISOString(),
            suspended_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 停止通知メールを送信（非同期で実行）
      emailService.sendAgencySuspendedEmail(data, suspension_reason)
        .catch((err) => console.error('停止通知メール送信エラー:', err.message));

      res.json({
        success: true,
        data,
        message: '代理店を停止しました'
      });
    } catch (error) {
      console.error('Suspend agency error:', error.message);
      res.status(500).json({
        error: true,
        message: '停止処理に失敗しました'
      });
    }
  }
);

module.exports = router;
