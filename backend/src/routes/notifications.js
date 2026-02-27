/**
 * 通知管理APIエンドポイント
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

/**
 * 通知設定取得
 * GET /api/notifications/settings
 */
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    if (!agencyId) {
      return res.status(403).json({ success: false, message: '代理店情報がありません' });
    }

    const { data: settings, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('agency_id', agencyId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // 設定が存在しない場合はデフォルト値を返す
    const defaultSettings = {
      new_sale_notification: true,
      commission_confirmed: true,
      invitation_accepted: true,
      monthly_report: true,
      system_announcement: true,
      email_enabled: true,
      in_app_enabled: true,
      notification_frequency: 'realtime',
      notification_time: '09:00:00'
    };

    res.json({
      success: true,
      data: settings || defaultSettings
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      message: '通知設定の取得に失敗しました'
    });
  }
});

/**
 * 通知設定更新
 * PUT /api/notifications/settings
 */
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    if (!agencyId) {
      return res.status(403).json({ success: false, message: '代理店情報がありません' });
    }
    const settings = req.body;

    // 既存の設定をチェック
    const { data: existing } = await supabase
      .from('notification_settings')
      .select('id')
      .eq('agency_id', agencyId)
      .single();

    let result;
    if (existing) {
      // 更新
      result = await supabase
        .from('notification_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq('agency_id', agencyId)
        .select()
        .single();
    } else {
      // 新規作成
      result = await supabase
        .from('notification_settings')
        .insert({
          agency_id: agencyId,
          ...settings
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    res.json({
      success: true,
      data: result.data,
      message: '通知設定を更新しました'
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      message: '通知設定の更新に失敗しました'
    });
  }
});

/**
 * 通知履歴取得
 * GET /api/notifications/history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    if (!agencyId) {
      return res.status(403).json({ success: false, message: '代理店情報がありません' });
    }
    const { page = 1, limit = 20, status } = req.query;

    let query = supabase
      .from('notification_history')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId)
      .order('sent_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // ページネーション
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: notifications, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: notifications || [],
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      success: false,
      message: '通知履歴の取得に失敗しました'
    });
  }
});

/**
 * 通知既読にする
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;
    if (!agencyId) {
      return res.status(403).json({ success: false, message: '代理店情報がありません' });
    }

    const { data, error } = await supabase
      .from('notification_history')
      .update({
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: '通知の既読処理に失敗しました'
    });
  }
});

/**
 * 未読通知数取得
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.user.agency_id;
    if (!agencyId) {
      return res.json({ success: true, count: 0 });
    }

    const { count, error } = await supabase
      .from('notification_history')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .neq('status', 'read');

    if (error) throw error;

    res.json({
      success: true,
      count: count || 0
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: '未読数の取得に失敗しました'
    });
  }
});

/**
 * テスト通知送信
 * POST /api/notifications/test
 */
router.post('/test', authenticateToken, (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
}, async (req, res) => {
  try {
    const { email } = req.user;
    const { type = 'test' } = req.body;

    // テストメール送信
    const result = await emailService.sendMail({
      to: email,
      subject: 'テスト通知',
      html: `
        <h2>テスト通知</h2>
        <p>これはテスト通知です。</p>
        <p>通知タイプ: ${type}</p>
        <p>送信時刻: ${new Date().toLocaleString('ja-JP')}</p>
      `
    });

    // 通知履歴に記録
    await supabase.from('notification_history').insert({
      agency_id: req.user.agency_id,
      notification_type: 'test',
      subject: 'テスト通知',
      content: 'これはテスト通知です',
      sent_to: email,
      sent_method: 'email',
      status: result.success ? 'sent' : 'failed',
      error_message: result.error
    });

    res.json({
      success: result.success,
      message: result.success ? 'テスト通知を送信しました' : 'テスト通知の送信に失敗しました',
      error: result.error
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'テスト通知の送信に失敗しました'
    });
  }
});

/**
 * 一括通知送信（管理者用）
 * POST /api/notifications/broadcast
 */
router.post('/broadcast', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    const { subject, message, targetAgencies = 'all' } = req.body;

    // 送信対象の代理店を取得
    let query = supabase.from('agencies').select('id, contact_email');

    if (targetAgencies !== 'all' && Array.isArray(targetAgencies)) {
      query = query.in('id', targetAgencies);
    }

    const { data: agencies, error } = await query;
    if (error) throw error;

    // 各代理店に通知を送信
    const results = await Promise.allSettled(
      agencies.map(async (agency) => {
        // メール送信
        const emailResult = await emailService.sendMail({
          to: agency.contact_email,
          subject,
          html: `
            <h2>${subject}</h2>
            <div>${message}</div>
            <hr>
            <p><small>このメールはシステムからの一括送信です。</small></p>
          `
        });

        // 通知履歴に記録
        await supabase.from('notification_history').insert({
          agency_id: agency.id,
          notification_type: 'broadcast',
          subject,
          content: message,
          sent_to: agency.contact_email,
          sent_method: 'email',
          status: emailResult.success ? 'sent' : 'failed',
          error_message: emailResult.error
        });

        return { agency: agency.id, success: emailResult.success };
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    res.json({
      success: true,
      message: `${successCount}/${agencies.length} 件の通知を送信しました`,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false })
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({
      success: false,
      message: '一括通知の送信に失敗しました'
    });
  }
});

module.exports = router;