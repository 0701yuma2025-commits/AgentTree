/**
 * 支払いサイクル自動化スケジューラー
 * node-cronを使用した自動バッチ処理
 */

require('dotenv').config();
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { calculateMonthlyCommissions } = require('../utils/calculateCommission');
const emailService = require('../services/emailService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * 月次締め処理
 * 実行タイミング: 毎月末日 23:59
 */
async function monthlyClosing() {
  console.log('🔒 月次締め処理を開始します...');

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const targetMonth = `${year}-${month}`;

    // 当月の未確定売上を取得
    const { data: pendingSales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .eq('status', 'pending')
      .gte('sale_date', `${targetMonth}-01`)
      .lt('sale_date', `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`);

    if (salesError) throw salesError;

    if (pendingSales && pendingSales.length > 0) {
      console.log(`⚠️  未確定売上が ${pendingSales.length} 件あります`);

      // 管理者に通知
      const { data: admins } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await emailService.sendEmail({
            to: admin.email,
            subject: `【要対応】未確定売上の確認 (${targetMonth})`,
            html: `
              <h2>月次締め処理の通知</h2>
              <p>${admin.full_name} 様</p>
              <p>${targetMonth}月の月次締め処理を実行しましたが、未確定の売上が ${pendingSales.length} 件あります。</p>
              <p>確認と対応をお願いします。</p>
              <ul>
                ${pendingSales.slice(0, 5).map(sale =>
                  `<li>${sale.sale_number}: ¥${sale.total_amount.toLocaleString()} (${sale.sale_date})</li>`
                ).join('')}
                ${pendingSales.length > 5 ? `<li>...他 ${pendingSales.length - 5} 件</li>` : ''}
              </ul>
            `
          });
        }
      }
    }

    console.log('✅ 月次締め処理が完了しました');

  } catch (error) {
    console.error('❌ 月次締め処理でエラーが発生しました:', error);

    // エラー時は管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendEmail({
          to: admin.email,
          subject: '【エラー】月次締め処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>月次締め処理中にエラーが発生しました。</p>
            <pre>${error.message}</pre>
          `
        });
      }
    }
  }
}

/**
 * 報酬自動計算
 * 実行タイミング: 毎月1日 02:00
 */
async function calculateCommissions() {
  console.log('💰 報酬計算を開始します...');

  try {
    // 前月を計算
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
    const targetMonth = `${year}-${month}`;

    console.log(`対象月: ${targetMonth}`);

    // 前月の確定済み売上を取得
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select(`
        *,
        agency:agencies(id, tier_level, parent_agency_id, company_type, invoice_registered),
        product:products(commission_rate_tier1, commission_rate_tier2, commission_rate_tier3, commission_rate_tier4)
      `)
      .eq('status', 'confirmed')
      .gte('sale_date', `${targetMonth}-01`)
      .lt('sale_date', `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`);

    if (salesError) throw salesError;

    if (!sales || sales.length === 0) {
      console.log('ℹ️  対象となる売上がありません');
      return;
    }

    console.log(`${sales.length} 件の売上を処理します`);

    // 既存の報酬データを削除
    const { error: deleteError } = await supabase
      .from('commissions')
      .delete()
      .eq('month', targetMonth);

    if (deleteError) throw deleteError;

    // 報酬計算
    const commissionsData = await calculateMonthlyCommissions(sales, targetMonth);

    // 報酬データを挿入
    const { error: insertError } = await supabase
      .from('commissions')
      .insert(commissionsData);

    if (insertError) throw insertError;

    console.log(`✅ ${commissionsData.length} 件の報酬を計算しました`);

    // 管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      const totalAmount = commissionsData.reduce((sum, c) => sum + c.final_amount, 0);

      for (const admin of admins) {
        await emailService.sendEmail({
          to: admin.email,
          subject: `【完了】報酬計算処理 (${targetMonth})`,
          html: `
            <h2>報酬計算完了のお知らせ</h2>
            <p>${admin.full_name} 様</p>
            <p>${targetMonth}月の報酬計算が完了しました。</p>
            <ul>
              <li>対象売上: ${sales.length} 件</li>
              <li>報酬データ: ${commissionsData.length} 件</li>
              <li>合計支払額: ¥${totalAmount.toLocaleString()}</li>
            </ul>
          `
        });
      }
    }

  } catch (error) {
    console.error('❌ 報酬計算でエラーが発生しました:', error);

    // エラー時は管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendEmail({
          to: admin.email,
          subject: '【エラー】報酬計算処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>報酬計算処理中にエラーが発生しました。</p>
            <pre>${error.message}</pre>
          `
        });
      }
    }
  }
}

/**
 * 支払い通知メール送信
 * 実行タイミング: 毎月20日 09:00
 */
async function sendPaymentReminders() {
  console.log('📧 支払い通知メールを送信します...');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 当月の報酬データを取得
    const { data: commissions, error: commError } = await supabase
      .from('commissions')
      .select(`
        *,
        agency:agencies(id, company_name, contact_email, user_id)
      `)
      .eq('month', currentMonth)
      .in('status', ['pending', 'confirmed']);

    if (commError) throw commError;

    if (!commissions || commissions.length === 0) {
      console.log('ℹ️  送信対象の報酬がありません');
      return;
    }

    // 代理店ごとに集計
    const agencyCommissions = {};
    for (const comm of commissions) {
      const agencyId = comm.agency_id;
      if (!agencyCommissions[agencyId]) {
        agencyCommissions[agencyId] = {
          agency: comm.agency,
          commissions: [],
          total: 0
        };
      }
      agencyCommissions[agencyId].commissions.push(comm);
      agencyCommissions[agencyId].total += comm.final_amount;
    }

    let sentCount = 0;

    // 各代理店にメール送信
    for (const [agencyId, data] of Object.entries(agencyCommissions)) {
      if (!data.agency.contact_email) continue;

      // 最低支払額未満はスキップ
      if (data.total < 10000) continue;

      await emailService.sendEmail({
        to: data.agency.contact_email,
        subject: `【ご案内】${currentMonth}月分の報酬確定のお知らせ`,
        html: `
          <h2>報酬確定のお知らせ</h2>
          <p>${data.agency.company_name} 様</p>
          <p>${currentMonth}月分の報酬が確定しましたのでご案内いたします。</p>

          <h3>報酬明細</h3>
          <ul>
            <li>基本報酬: ¥${data.commissions.reduce((sum, c) => sum + c.base_amount, 0).toLocaleString()}</li>
            <li>階層ボーナス: ¥${data.commissions.reduce((sum, c) => sum + (c.tier_bonus || 0), 0).toLocaleString()}</li>
            <li>キャンペーンボーナス: ¥${data.commissions.reduce((sum, c) => sum + (c.campaign_bonus || 0), 0).toLocaleString()}</li>
            <li>源泉徴収: -¥${data.commissions.reduce((sum, c) => sum + (c.withholding_tax || 0), 0).toLocaleString()}</li>
          </ul>

          <h3 style="color: #4A90E2;">お支払い額: ¥${data.total.toLocaleString()}</h3>

          <p>お支払い予定日: ${now.getFullYear()}年${now.getMonth() + 1}月25日</p>
          <p>※詳細は管理画面の請求書ページよりご確認いただけます。</p>
        `
      });

      sentCount++;
    }

    console.log(`✅ ${sentCount} 件の通知メールを送信しました`);

  } catch (error) {
    console.error('❌ 支払い通知メール送信でエラーが発生しました:', error);
  }
}

/**
 * スケジューラーを起動
 */
function startScheduler() {
  console.log('🚀 支払いサイクル自動化スケジューラーを起動します');

  // 毎月末日 23:59 に月次締め処理
  // L は月末を表す（node-cronの拡張構文ではないため、代替実装）
  cron.schedule('59 23 28-31 * *', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 明日が翌月の1日なら実行（= 今日が月末）
    if (tomorrow.getDate() === 1) {
      await monthlyClosing();
    }
  });

  // 毎月1日 02:00 に報酬計算
  cron.schedule('0 2 1 * *', async () => {
    await calculateCommissions();
  });

  // 毎月20日 09:00 に支払い通知メール
  cron.schedule('0 9 20 * *', async () => {
    await sendPaymentReminders();
  });

  // 日次バックアップ（毎日 03:00）
  cron.schedule('0 3 * * *', async () => {
    console.log('💾 日次バックアップ処理（未実装）');
  });

  console.log('✅ スケジューラーが起動しました');
  console.log('⏰ 月次締め: 毎月末日 23:59');
  console.log('⏰ 報酬計算: 毎月1日 02:00');
  console.log('⏰ 支払い通知: 毎月20日 09:00');
  console.log('⏰ バックアップ: 毎日 03:00');
}

// このファイルが直接実行された場合
if (require.main === module) {
  startScheduler();

  // プロセスを維持
  process.on('SIGTERM', () => {
    console.log('🛑 スケジューラーを停止します');
    process.exit(0);
  });
}

// エクスポート（server.jsから使用する場合）
module.exports = {
  startScheduler,
  monthlyClosing,
  calculateCommissions,
  sendPaymentReminders
};
