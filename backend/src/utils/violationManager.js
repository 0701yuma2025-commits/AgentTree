/**
 * 違反管理ユーティリティ
 * 異常検知による違反カウント・自動制限を管理
 */

const { supabase } = require('../config/supabase');
const { createModuleLogger } = require('../config/logger');
const emailService = require('../services/emailService');
const logger = createModuleLogger('violationManager');

// 閾値設定
const THRESHOLDS = {
  WARNING: 3,     // 警告メール送信
  SUSPEND: 5,     // 自動停止
  TERMINATE: 10,  // 自動解約
};

/**
 * 違反を記録し、閾値に応じた自動制限を実行
 * @param {String} agencyId - 代理店ID
 * @param {Object} anomalyResult - 異常検知結果
 * @returns {Object} 処理結果
 */
async function recordViolation(agencyId, anomalyResult) {
  try {
    // 現在の代理店情報を取得
    const { data: agency, error: fetchError } = await supabase
      .from('agencies')
      .select('id, company_name, contact_email, violation_count, status, metadata')
      .eq('id', agencyId)
      .single();

    if (fetchError || !agency) {
      logger.error({ err: fetchError }, '代理店情報の取得に失敗');
      return { success: false, error: '代理店情報の取得に失敗' };
    }

    // terminated の場合はこれ以上処理しない
    if (agency.status === 'terminated') {
      return { success: true, action: 'none', reason: '既に解約済み' };
    }

    const newCount = (agency.violation_count || 0) + 1;

    // 違反履歴をmetadataに記録
    const violations = agency.metadata?.violations || [];
    violations.push({
      date: new Date().toISOString(),
      anomaly_score: anomalyResult.anomaly_score,
      reasons: anomalyResult.reasons,
      violation_number: newCount,
    });

    let action = 'counted';
    let newStatus = agency.status;
    const metadataUpdate = {
      ...(agency.metadata || {}),
      violations,
    };

    // 閾値判定
    if (newCount >= THRESHOLDS.TERMINATE && agency.status !== 'terminated') {
      newStatus = 'terminated';
      action = 'terminated';
      metadataUpdate.terminated_at = new Date().toISOString();
      metadataUpdate.termination_reason = `違反回数${newCount}回により自動解約`;
    } else if (newCount >= THRESHOLDS.SUSPEND && agency.status === 'active') {
      newStatus = 'suspended';
      action = 'suspended';
      metadataUpdate.auto_suspended_at = new Date().toISOString();
      metadataUpdate.suspension_reason = `違反回数${newCount}回により自動停止`;
    } else if (newCount >= THRESHOLDS.WARNING) {
      action = 'warning';
    }

    // DB更新
    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        violation_count: newCount,
        status: newStatus,
        metadata: metadataUpdate,
      })
      .eq('id', agencyId);

    if (updateError) {
      logger.error({ err: updateError }, '違反カウント更新に失敗');
      return { success: false, error: '違反カウント更新に失敗' };
    }

    // アクションに応じた通知
    if (action === 'warning') {
      emailService.sendViolationWarningEmail(agency, newCount, THRESHOLDS.SUSPEND)
        .catch(err => logger.error({ err }, '警告メール送信エラー'));
    } else if (action === 'suspended') {
      emailService.sendAgencySuspendedEmail(
        { ...agency, status: 'suspended' },
        `違反回数${newCount}回により自動停止されました。`
      ).catch(err => logger.error({ err }, '自動停止通知メール送信エラー'));
    } else if (action === 'terminated') {
      emailService.sendAgencyTerminatedEmail(agency, newCount)
        .catch(err => logger.error({ err }, '解約通知メール送信エラー'));
    }

    logger.info({
      agencyId,
      violationCount: newCount,
      action,
      anomalyScore: anomalyResult.anomaly_score,
    }, `違反記録: ${action}`);

    return {
      success: true,
      action,
      violation_count: newCount,
      new_status: newStatus,
    };
  } catch (error) {
    logger.error({ err: error }, '違反記録処理エラー');
    return { success: false, error: '違反記録処理中にエラーが発生しました' };
  }
}

module.exports = {
  recordViolation,
  THRESHOLDS,
};
