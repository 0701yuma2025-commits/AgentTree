/**
 * 売上異常検知API
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const emailService = require('../../services/emailService');
const { safeErrorMessage } = require('../../utils/errorHelper');

/**
 * 異常検知通知を送信
 */
async function sendAnomalyNotification(sale, anomalyResult) {
  // 管理者のメールアドレスを取得
  const { data: admins } = await supabase
    .from('users')
    .select('email, full_name')
    .in('role', ['admin', 'super_admin']);

  if (!admins || admins.length === 0) return;

  // 代理店情報を取得
  const { data: agency } = await supabase
    .from('agencies')
    .select('company_name, agency_code')
    .eq('id', sale.agency_id)
    .single();

  const emailContent = `
    <h2>⚠️ 売上異常検知アラート</h2>
    <p>以下の売上で異常が検知されました。確認が必要です。</p>

    <h3>売上情報</h3>
    <ul>
      <li>売上番号: ${sale.sale_number}</li>
      <li>代理店: ${agency?.company_name} (${agency?.agency_code})</li>
      <li>金額: ¥${sale.total_amount.toLocaleString()}</li>
      <li>顧客: ${sale.customer_name}</li>
      <li>売上日: ${sale.sale_date}</li>
    </ul>

    <h3>検知内容</h3>
    <ul>
      <li>異常スコア: ${anomalyResult.anomaly_score}/100</li>
      <li>検知理由:</li>
      <ul>
        ${anomalyResult.reasons.map(reason => `<li>${reason}</li>`).join('')}
      </ul>
    </ul>

    <h3>詳細</h3>
    ${anomalyResult.details.spike.detected ? `
      <h4>売上スパイク</h4>
      <ul>
        <li>今月売上: ¥${anomalyResult.details.spike.current_total.toLocaleString()}</li>
        <li>前月売上: ¥${anomalyResult.details.spike.previous_total.toLocaleString()}</li>
        <li>成長率: ${anomalyResult.details.spike.growth_rate?.toFixed(1)}%</li>
      </ul>
    ` : ''}

    ${anomalyResult.details.rapid_entry.detected ? `
      <h4>大量登録</h4>
      <ul>
        <li>${anomalyResult.details.rapid_entry.time_window_hours}時間以内の登録数: ${anomalyResult.details.rapid_entry.count}件</li>
        <li>閾値: ${anomalyResult.details.rapid_entry.threshold}件</li>
      </ul>
    ` : ''}

    ${anomalyResult.details.abnormal_amount.detected ? `
      <h4>異常金額</h4>
      <ul>
        <li>売上金額: ¥${anomalyResult.details.abnormal_amount.amount.toLocaleString()}</li>
        <li>過去平均: ¥${anomalyResult.details.abnormal_amount.average?.toLocaleString()}</li>
        <li>統計的異常度: ${anomalyResult.details.abnormal_amount.z_score?.toFixed(2)}σ</li>
      </ul>
    ` : ''}

    <p><a href="${process.env.FRONTEND_URL}/sales/${sale.id}">売上詳細を確認</a></p>
  `;

  // 各管理者にメール送信
  for (const admin of admins) {
    await emailService.sendEmail({
      to: admin.email,
      subject: `【要確認】売上異常検知: ${sale.sale_number}`,
      html: emailContent
    });
  }

  // システム通知も作成
  await supabase
    .from('notifications')
    .insert({
      type: 'anomaly_detection',
      title: '売上異常検知',
      content: `売上番号 ${sale.sale_number} で異常を検知しました`,
      data: {
        sale_id: sale.id,
        anomaly_result: anomalyResult
      },
      priority: 'high',
      target_roles: ['admin', 'super_admin']
    });
}

/**
 * GET /api/sales/anomalies
 * 異常検知された売上一覧取得（管理者のみ）
 */
router.get('/anomalies', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    const { reviewed = 'false', start_date, end_date } = req.query;

    let query = supabase
      .from('sales')
      .select(`
        *,
        agency:agencies!inner(id, company_name, agency_code),
        product:products(id, name, price)
      `)
      .eq('anomaly_detected', true)
      .order('anomaly_score', { ascending: false });

    // レビュー状態でフィルタ
    if (reviewed === 'false') {
      query = query.eq('requires_review', true);
    }

    // 日付範囲フィルタ
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      summary: {
        total_anomalies: data?.length || 0,
        pending_review: data?.filter(s => s.requires_review).length || 0,
        high_score_count: data?.filter(s => s.anomaly_score >= 70).length || 0
      }
    });
  } catch (error) {
    console.error('Get anomaly sales error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * PUT /api/sales/:id/review
 * 異常検知された売上のレビューを完了（管理者のみ）
 */
router.put('/:id/review', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    const { id } = req.params;
    const { review_status, review_notes } = req.body;

    // review_status のバリデーション
    const validReviewStatuses = ['reviewed', 'approved', 'rejected'];
    if (review_status && !validReviewStatuses.includes(review_status)) {
      return res.status(400).json({
        success: false,
        message: `review_statusが無効です。有効な値: ${validReviewStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from('sales')
      .update({
        requires_review: false,
        review_status: review_status || 'reviewed',
        review_notes: review_notes || null,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'レビューが完了しました',
      data
    });
  } catch (error) {
    console.error('Review sale error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

module.exports = router;
module.exports.sendAnomalyNotification = sendAnomalyNotification;
