/**
 * 異常検知ユーティリティ
 */

const { supabase } = require('../config/supabase');

/**
 * 売上スパイクを検知
 * @param {Object} newSale - 新規売上データ
 * @param {Number} thresholdPercent - 異常と判定する増加率（デフォルト500%）
 * @returns {Object} 検知結果
 */
async function detectSalesSpike(newSale, thresholdPercent = 500) {
  try {
    // 現在の日付情報を取得
    const saleDate = new Date(newSale.sale_date);
    const currentMonth = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;

    // 前月の計算
    const previousMonthDate = new Date(saleDate.getFullYear(), saleDate.getMonth() - 1, 1);
    const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // 今月の売上合計（新規売上を含む）
    const { data: currentMonthSales, error: currentError } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('agency_id', newSale.agency_id)
      .eq('status', 'confirmed')
      .gte('sale_date', `${currentMonth}-01`)
      .lt('sale_date', `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 2).padStart(2, '0')}-01`);

    if (currentError) throw currentError;

    // 前月の売上合計
    const { data: previousMonthSales, error: previousError } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('agency_id', newSale.agency_id)
      .eq('status', 'confirmed')
      .gte('sale_date', `${previousMonth}-01`)
      .lt('sale_date', `${currentMonth}-01`);

    if (previousError) throw previousError;

    // 売上合計を計算
    const currentTotal = (currentMonthSales || []).reduce((sum, sale) =>
      sum + parseFloat(sale.total_amount), 0) + parseFloat(newSale.total_amount);
    const previousTotal = (previousMonthSales || []).reduce((sum, sale) =>
      sum + parseFloat(sale.total_amount), 0);

    // 前月売上がない場合
    if (previousTotal === 0) {
      return {
        detected: false,
        reason: '前月売上なし',
        current_total: currentTotal,
        previous_total: previousTotal,
        growth_rate: null
      };
    }

    // 成長率を計算
    const growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;

    // スパイク検知
    const isSpike = growthRate >= thresholdPercent;

    return {
      detected: isSpike,
      reason: isSpike ? `前月比${growthRate.toFixed(1)}%の急増` : null,
      current_total: currentTotal,
      previous_total: previousTotal,
      growth_rate: growthRate,
      threshold: thresholdPercent,
      month_comparison: {
        current_month: currentMonth,
        previous_month: previousMonth
      }
    };

  } catch (error) {
    console.error('売上スパイク検知エラー:', error);
    return {
      detected: false,
      error: '検知処理中にエラーが発生しました'
    };
  }
}

/**
 * 短期間での大量売上登録を検知
 * @param {String} agencyId - 代理店ID
 * @param {Number} timeWindowHours - 監視時間枠（デフォルト24時間）
 * @param {Number} maxCount - 最大許容件数（デフォルト50件）
 * @returns {Object} 検知結果
 */
async function detectRapidSalesEntry(agencyId, timeWindowHours = 24, maxCount = 50) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (timeWindowHours * 60 * 60 * 1000));

    // 指定時間内の売上件数を取得
    const { count, error } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .gte('created_at', windowStart.toISOString());

    if (error) throw error;

    const isAnomaly = count >= maxCount;

    return {
      detected: isAnomaly,
      reason: isAnomaly ? `${timeWindowHours}時間以内に${count}件の売上登録` : null,
      count: count,
      threshold: maxCount,
      time_window_hours: timeWindowHours
    };

  } catch (error) {
    console.error('大量売上登録検知エラー:', error);
    return {
      detected: false,
      error: '検知処理中にエラーが発生しました'
    };
  }
}

/**
 * 異常な金額の売上を検知
 * @param {Object} sale - 売上データ
 * @param {Number} maxAmount - 最大許容金額（デフォルト1000万円）
 * @returns {Object} 検知結果
 */
async function detectAbnormalAmount(sale, maxAmount = 10000000) {
  try {
    // 代理店の過去の平均売上を取得
    const { data: historicalSales, error } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('agency_id', sale.agency_id)
      .eq('status', 'confirmed')
      .neq('id', sale.id || 'new')
      .limit(100)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const saleAmount = parseFloat(sale.total_amount);

    // 絶対値チェック
    if (saleAmount > maxAmount) {
      return {
        detected: true,
        reason: `売上金額が上限値（¥${maxAmount.toLocaleString()}）を超過`,
        amount: saleAmount,
        max_amount: maxAmount
      };
    }

    // 履歴がない場合は絶対値チェックのみ
    if (!historicalSales || historicalSales.length < 5) {
      return {
        detected: false,
        reason: '履歴データ不足',
        amount: saleAmount
      };
    }

    // 平均と標準偏差を計算
    const amounts = historicalSales.map(s => parseFloat(s.total_amount));
    const average = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - average, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // 3σを超える場合は異常とみなす
    const zScore = Math.abs((saleAmount - average) / stdDev);
    const isAnomaly = zScore > 3;

    return {
      detected: isAnomaly,
      reason: isAnomaly ? `金額が統計的に異常（平均の${(saleAmount / average).toFixed(1)}倍）` : null,
      amount: saleAmount,
      average: average,
      std_dev: stdDev,
      z_score: zScore
    };

  } catch (error) {
    console.error('異常金額検知エラー:', error);
    return {
      detected: false,
      error: '検知処理中にエラーが発生しました'
    };
  }
}

/**
 * 複合的な異常検知
 * @param {Object} sale - 売上データ
 * @returns {Object} 総合検知結果
 */
async function detectAnomalies(sale) {
  const results = {
    spike: await detectSalesSpike(sale),
    rapid_entry: await detectRapidSalesEntry(sale.agency_id),
    abnormal_amount: await detectAbnormalAmount(sale)
  };

  // いずれかの異常が検知された場合
  const hasAnomaly = results.spike.detected ||
                     results.rapid_entry.detected ||
                     results.abnormal_amount.detected;

  const anomalyReasons = [];
  if (results.spike.detected) anomalyReasons.push(results.spike.reason);
  if (results.rapid_entry.detected) anomalyReasons.push(results.rapid_entry.reason);
  if (results.abnormal_amount.detected) anomalyReasons.push(results.abnormal_amount.reason);

  return {
    has_anomaly: hasAnomaly,
    anomaly_score: calculateAnomalyScore(results),
    reasons: anomalyReasons,
    details: results,
    requires_review: hasAnomaly,
    timestamp: new Date().toISOString()
  };
}

/**
 * 異常スコアを計算（0-100）
 */
function calculateAnomalyScore(results) {
  let score = 0;

  // スパイク検知（最大40点）
  if (results.spike.detected && results.spike.growth_rate) {
    score += Math.min(40, results.spike.growth_rate / 50); // 500%で10点、2000%で40点
  }

  // 大量登録（最大30点）
  if (results.rapid_entry.detected && results.rapid_entry.count) {
    const overageRatio = results.rapid_entry.count / results.rapid_entry.threshold;
    score += Math.min(30, overageRatio * 15);
  }

  // 異常金額（最大30点）
  if (results.abnormal_amount.detected && results.abnormal_amount.z_score) {
    score += Math.min(30, results.abnormal_amount.z_score * 5);
  }

  return Math.min(100, Math.round(score));
}

module.exports = {
  detectSalesSpike,
  detectRapidSalesEntry,
  detectAbnormalAmount,
  detectAnomalies,
  calculateAnomalyScore
};