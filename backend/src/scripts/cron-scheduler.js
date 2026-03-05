/**
 * 支払いサイクル自動化スケジューラー
 * node-cronを使用した自動バッチ処理
 */

require('dotenv').config();
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { calculateMonthlyCommissions } = require('../utils/calculateCommission');
const emailService = require('../services/emailService');
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('cron-scheduler');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * 月次締め処理
 * 実行タイミング: 毎月末日 23:59
 */
async function monthlyClosing() {
  logger.info('🔒 月次締め処理を開始します...');

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
      logger.info(`⚠️  未確定売上が ${pendingSales.length} 件あります`);

      // 管理者に通知
      const { data: admins } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await emailService.sendMail({
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

    logger.info('✅ 月次締め処理が完了しました');

  } catch (error) {
    logger.error({ err: error }, '❌ 月次締め処理でエラーが発生しました');

    // エラー時は管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendMail({
          to: admin.email,
          subject: '【エラー】月次締め処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>月次締め処理中にエラーが発生しました。</p>
            <p>詳細はサーバーログを確認してください。</p>
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
  logger.info('💰 報酬計算を開始します...');

  try {
    // 前月を計算
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
    const targetMonth = `${year}-${month}`;

    // 翌月の1日を正しく計算（12月→翌年1月の跨ぎに対応）
    const nextMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

    logger.info(`対象月: ${targetMonth}`);

    // 前月の確定済み売上を取得
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select(`
        *,
        agency:agencies(id, tier_level, parent_agency_id, company_type, invoice_registered),
        product:products(tier1_commission_rate, tier2_commission_rate, tier3_commission_rate, tier4_commission_rate)
      `)
      .eq('status', 'confirmed')
      .gte('sale_date', `${targetMonth}-01`)
      .lt('sale_date', nextMonthStr);

    if (salesError) throw salesError;

    if (!sales || sales.length === 0) {
      logger.info('ℹ️  対象となる売上がありません');
      return;
    }

    logger.info(`${sales.length} 件の売上を処理します`);

    // 全代理店データを取得
    const { data: agencies, error: agenciesError } = await supabase
      .from('agencies')
      .select('*')
      .eq('status', 'active');

    if (agenciesError) throw agenciesError;

    // 商品データを取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (productsError) throw productsError;

    // 報酬設定を取得
    const { data: settingsRows } = await supabase
      .from('commission_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    const commissionSettings = settingsRows?.[0] || null;

    // 報酬計算
    const commissionsData = calculateMonthlyCommissions(sales, agencies, products, targetMonth, commissionSettings);

    // DELETE+INSERTで既存データを置換
    const { error: deleteError } = await supabase
      .from('commissions')
      .delete()
      .eq('month', targetMonth);

    if (deleteError) throw deleteError;

    if (commissionsData.length > 0) {
      const { error: insertError } = await supabase
        .from('commissions')
        .insert(commissionsData);

      if (insertError) throw insertError;
    }

    logger.info(`✅ ${commissionsData.length} 件の報酬を計算しました`);

    // 管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      const totalAmount = commissionsData.reduce((sum, c) => sum + c.final_amount, 0);

      for (const admin of admins) {
        await emailService.sendMail({
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
    logger.error({ err: error }, '❌ 報酬計算でエラーが発生しました');

    // エラー時は管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendMail({
          to: admin.email,
          subject: '【エラー】報酬計算処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>報酬計算処理中にエラーが発生しました。</p>
            <p>詳細はサーバーログを確認してください。</p>
          `
        });
      }
    }
  }
}

/**
 * 繰越報酬の自動スイープ
 * 実行タイミング: 毎月1日 03:00（報酬計算の後）
 *
 * carried_forward ステータスの報酬を翌月（当月）に統合する。
 * 統合後に最低支払額を超えたらconfirmedに変更、超えなければ再度carried_forwardとする。
 */
async function sweepCarriedForwardCommissions() {
  logger.info('🔄 繰越報酬のスイープ処理を開始します...');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 報酬設定を取得（最低支払額の判定に使用）
    const { data: settingsRows } = await supabase
      .from('commission_settings')
      .select('minimum_payment_amount')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const minimumPayment = settingsRows?.[0]?.minimum_payment_amount || 10000;

    // carried_forward ステータスの報酬を取得
    const { data: carriedCommissions, error: fetchError } = await supabase
      .from('commissions')
      .select('*')
      .eq('status', 'carried_forward');

    if (fetchError) throw fetchError;

    if (!carriedCommissions || carriedCommissions.length === 0) {
      logger.info('ℹ️  繰越対象の報酬がありません');
      return;
    }

    logger.info(`${carriedCommissions.length} 件の繰越報酬を処理します`);

    // 代理店ごとに集約
    const agencyTotals = {};
    for (const comm of carriedCommissions) {
      if (!agencyTotals[comm.agency_id]) {
        agencyTotals[comm.agency_id] = {
          commissionIds: [],
          total: 0
        };
      }
      agencyTotals[comm.agency_id].commissionIds.push(comm.id);
      agencyTotals[comm.agency_id].total += comm.final_amount;
    }

    let sweptCount = 0;
    let remainCount = 0;

    for (const [agencyId, data] of Object.entries(agencyTotals)) {
      // 当月の既存報酬合計を取得（繰越分を加算して最低支払額を判定）
      const { data: currentCommissions } = await supabase
        .from('commissions')
        .select('final_amount')
        .eq('agency_id', agencyId)
        .eq('month', currentMonth)
        .neq('status', 'carried_forward');

      const currentTotal = (currentCommissions || []).reduce((sum, c) => sum + c.final_amount, 0);
      const grandTotal = currentTotal + data.total;

      if (grandTotal >= minimumPayment) {
        // 最低支払額を超えた → 繰越報酬のmonthを当月に更新し、confirmedに変更
        const { error: updateError } = await supabase
          .from('commissions')
          .update({
            month: currentMonth,
            status: 'confirmed',
            calculation_details: supabase.rpc ? undefined : undefined, // calculation_detailsはそのまま維持
            updated_at: new Date().toISOString()
          })
          .in('id', data.commissionIds);

        if (updateError) {
          logger.error({ err: updateError }, `❌ ${agencyId} の繰越報酬更新に失敗`);
          continue;
        }

        sweptCount += data.commissionIds.length;
        logger.info(`✅ 代理店 ${agencyId}: ${data.commissionIds.length}件の繰越報酬を当月(${currentMonth})に統合 (合計: ¥${grandTotal.toLocaleString()})`);
      } else {
        // まだ最低支払額未満 → monthだけ当月に更新（次月のスイープ対象に）
        const { error: updateError } = await supabase
          .from('commissions')
          .update({
            month: currentMonth,
            updated_at: new Date().toISOString()
          })
          .in('id', data.commissionIds);

        if (updateError) {
          logger.error({ err: updateError }, `❌ ${agencyId} の繰越報酬月更新に失敗`);
          continue;
        }

        remainCount += data.commissionIds.length;
        logger.info(`⏭️  代理店 ${agencyId}: 最低支払額未満のため繰越継続 (¥${grandTotal.toLocaleString()} < ¥${minimumPayment.toLocaleString()})`);
      }
    }

    logger.info(`✅ 繰越スイープ完了: ${sweptCount}件統合, ${remainCount}件繰越継続`);

    // 管理者に通知（統合があった場合のみ）
    if (sweptCount > 0) {
      const { data: admins } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await emailService.sendMail({
            to: admin.email,
            subject: `【完了】繰越報酬スイープ処理 (${currentMonth})`,
            html: `
              <h2>繰越報酬スイープ完了</h2>
              <p>${admin.full_name} 様</p>
              <p>繰越報酬の自動統合処理が完了しました。</p>
              <ul>
                <li>統合件数: ${sweptCount}件（confirmedに変更）</li>
                <li>繰越継続: ${remainCount}件（最低支払額未満）</li>
              </ul>
            `
          });
        }
      }
    }

  } catch (error) {
    logger.error({ err: error }, '❌ 繰越報酬スイープでエラーが発生しました');

    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendMail({
          to: admin.email,
          subject: '【エラー】繰越報酬スイープ処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>繰越報酬スイープ処理中にエラーが発生しました。</p>
            <p>詳細はサーバーログを確認してください。</p>
          `
        });
      }
    }
  }
}

/**
 * 支払い通知メール送信
 * 実行タイミング: 毎月1日 06:00（報酬計算完了後）
 */
async function sendPaymentReminders() {
  logger.info('📧 支払い通知メールを送信します...');

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
      logger.info('ℹ️  送信対象の報酬がありません');
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

      await emailService.sendMail({
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

    logger.info(`✅ ${sentCount} 件の通知メールを送信しました`);

  } catch (error) {
    logger.error({ err: error }, '❌ 支払い通知メール送信でエラーが発生しました');
  }
}

/**
 * 月次支払い実行処理
 * 実行タイミング: 毎月25日 10:00
 */
async function processMonthlyPayments() {
  logger.info('💸 月次支払い処理を開始します...');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const paymentDate = `${currentMonth}-25`;

    // 承認済み（approved）の報酬データを取得
    const { data: commissions, error: commError } = await supabase
      .from('commissions')
      .select(`
        *,
        agency:agencies(id, company_name, contact_email)
      `)
      .eq('month', currentMonth)
      .eq('status', 'approved');

    if (commError) throw commError;

    if (!commissions || commissions.length === 0) {
      logger.info('ℹ️  支払い対象の報酬がありません');
      return;
    }

    logger.info(`${commissions.length} 件の報酬を処理します`);

    // 代理店ごとに集計
    const agencyPayments = {};
    for (const comm of commissions) {
      const agencyId = comm.agency_id;
      if (!agencyPayments[agencyId]) {
        agencyPayments[agencyId] = {
          agency: comm.agency,
          commissionIds: [],
          total: 0
        };
      }
      agencyPayments[agencyId].commissionIds.push(comm.id);
      agencyPayments[agencyId].total += comm.final_amount;
    }

    let processedCount = 0;
    let totalAmount = 0;
    const paymentRecords = [];

    // 各代理店の支払い処理
    for (const [agencyId, data] of Object.entries(agencyPayments)) {
      // 最低支払額チェック（1万円未満はスキップ）
      if (data.total < 10000) {
        logger.info(`⏭️  ${data.agency.company_name}: 最低支払額未満 (¥${data.total.toLocaleString()})`);
        continue;
      }

      // 1. 報酬ステータスを paid に更新
      const { error: updateError } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          payment_date: paymentDate
        })
        .in('id', data.commissionIds);

      if (updateError) {
        logger.error({ err: updateError }, `❌ ${data.agency.company_name} の報酬更新に失敗`);
        continue;
      }

      // 2. payment_history に記録
      const paymentRecord = {
        agency_id: agencyId,
        amount: data.total,
        payment_method: 'bank_transfer',
        payment_date: paymentDate,
        reference_number: `PAY-${currentMonth.replace('-', '')}-${agencyId.substring(0, 8)}`,
        status: 'completed',
        notes: `${currentMonth}月分の報酬支払い（${data.commissionIds.length}件の報酬）`
      };

      const { error: insertError } = await supabase
        .from('payment_history')
        .insert(paymentRecord);

      if (insertError) {
        logger.error({ err: insertError }, `❌ ${data.agency.company_name} の支払い履歴記録に失敗`);
        continue;
      }

      paymentRecords.push({
        agencyName: data.agency.company_name,
        amount: data.total,
        count: data.commissionIds.length
      });

      // 3. 代理店に支払い完了メール送信
      if (data.agency.contact_email) {
        await emailService.sendMail({
          to: data.agency.contact_email,
          subject: `【完了】${currentMonth}月分の報酬支払いのお知らせ`,
          html: `
            <h2>報酬支払い完了のお知らせ</h2>
            <p>${data.agency.company_name} 様</p>
            <p>${currentMonth}月分の報酬をお支払いいたしました。</p>

            <h3>支払い詳細</h3>
            <ul>
              <li>支払い金額: ¥${data.total.toLocaleString()}</li>
              <li>支払い日: ${paymentDate}</li>
              <li>参照番号: ${paymentRecord.reference_number}</li>
              <li>報酬件数: ${data.commissionIds.length} 件</li>
            </ul>

            <p>ご確認の程、よろしくお願いいたします。</p>
            <p>※詳細は管理画面の請求書ページよりご確認いただけます。</p>
          `
        });
      }

      processedCount++;
      totalAmount += data.total;

      logger.info(`✅ ${data.agency.company_name}: ¥${data.total.toLocaleString()}`);
    }

    logger.info(`✅ ${processedCount} 社への支払い処理が完了しました (合計: ¥${totalAmount.toLocaleString()})`);

    // 4. 管理者に支払い完了レポート送信
    const { data: admins } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendMail({
          to: admin.email,
          subject: `【完了】${currentMonth}月分の支払い処理レポート`,
          html: `
            <h2>月次支払い処理完了</h2>
            <p>${admin.full_name} 様</p>
            <p>${currentMonth}月分の支払い処理が完了しました。</p>

            <h3>処理サマリー</h3>
            <ul>
              <li>処理件数: ${processedCount} 社</li>
              <li>合計支払額: ¥${totalAmount.toLocaleString()}</li>
              <li>支払い日: ${paymentDate}</li>
            </ul>

            <h3>支払い明細</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <th>代理店名</th>
                <th>支払額</th>
                <th>報酬件数</th>
              </tr>
              ${paymentRecords.map(p => `
                <tr>
                  <td>${p.agencyName}</td>
                  <td>¥${p.amount.toLocaleString()}</td>
                  <td>${p.count}</td>
                </tr>
              `).join('')}
            </table>
          `
        });
      }
    }

  } catch (error) {
    logger.error({ err: error }, '❌ 月次支払い処理でエラーが発生しました');

    // エラー時は管理者に通知
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await emailService.sendMail({
          to: admin.email,
          subject: '【エラー】月次支払い処理の失敗',
          html: `
            <h2>エラー通知</h2>
            <p>月次支払い処理中にエラーが発生しました。</p>
            <p>詳細はサーバーログを確認してください。</p>
          `
        });
      }
    }
  }
}

/**
 * 期限切れパスワードリセットトークンのクリーンアップ
 * 実行タイミング: 毎日 04:00
 *
 * agenciesテーブルに残存する期限切れの password_reset_token / password_reset_expiry を NULL に更新する。
 */
async function cleanupExpiredResetTokens() {
  logger.info('🧹 期限切れパスワードリセットトークンのクリーンアップを開始します...');

  try {
    // password_reset_expiry が現在時刻より前のレコードを取得
    const { data: expiredAgencies, error: fetchError } = await supabase
      .from('agencies')
      .select('id')
      .not('password_reset_token', 'is', null)
      .lt('password_reset_expiry', new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!expiredAgencies || expiredAgencies.length === 0) {
      logger.info('ℹ️  クリーンアップ対象のトークンがありません');
      return;
    }

    const ids = expiredAgencies.map(a => a.id);

    const { error: updateError } = await supabase
      .from('agencies')
      .update({
        password_reset_token: null,
        password_reset_expiry: null
      })
      .in('id', ids);

    if (updateError) throw updateError;

    logger.info(`✅ ${ids.length} 件の期限切れリセットトークンをクリーンアップしました`);
  } catch (error) {
    logger.error({ err: error }, '❌ リセットトークンクリーンアップでエラーが発生しました');
  }
}

/**
 * 解約済み代理店のデータクリーンアップ
 * terminated後1年経過した代理店の関連データを削除（代理店レコード自体は保持）
 * 実行タイミング: 毎月1日 05:00
 */
async function cleanupTerminatedAgencies() {
  logger.info('🗑️ 解約済み代理店のデータクリーンアップを開始します...');

  try {
    // 1年前の日付
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // terminated かつ terminated_at が1年以上前の代理店を取得
    const { data: agencies, error: fetchError } = await supabase
      .from('agencies')
      .select('id, company_name, metadata')
      .eq('status', 'terminated');

    if (fetchError) throw fetchError;

    // terminated_at が1年以上前のもののみ対象
    const expiredAgencies = (agencies || []).filter(a => {
      const terminatedAt = a.metadata?.terminated_at;
      if (!terminatedAt) return false;
      return new Date(terminatedAt) < oneYearAgo;
    });

    if (expiredAgencies.length === 0) {
      logger.info('ℹ️  クリーンアップ対象の解約済み代理店がありません');
      return;
    }

    const ids = expiredAgencies.map(a => a.id);
    logger.info(`🔍 ${ids.length} 件の解約済み代理店（1年以上経過）を検出`);

    // 関連データを削除（代理店レコード自体は監査のため保持）
    const tables = ['sales', 'commissions', 'payment_records'];
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .in('agency_id', ids);

      if (error) {
        logger.error({ err: error }, `${table}の削除に失敗`);
      } else {
        logger.info(`✅ ${table} のデータを削除しました`);
      }
    }

    // 代理店レコードの個人情報を匿名化
    for (const id of ids) {
      const { error } = await supabase
        .from('agencies')
        .update({
          representative_name: '削除済み',
          contact_email: null,
          contact_phone: null,
          email: null,
          address: null,
          postal_code: null,
          bank_account: null,
          tax_info: null,
          birth_date: null,
          metadata: {
            data_cleaned_at: new Date().toISOString(),
            original_status: 'terminated'
          }
        })
        .eq('id', id);

      if (error) {
        logger.error({ err: error }, `代理店 ${id} の匿名化に失敗`);
      }
    }

    logger.info(`✅ ${ids.length} 件の解約済み代理店データをクリーンアップしました`);
    logger.info(`対象: ${expiredAgencies.map(a => a.company_name).join(', ')}`);

  } catch (error) {
    logger.error({ err: error }, '❌ 解約済み代理店クリーンアップでエラーが発生しました');
  }
}

/**
 * スケジューラーを起動
 */
function startScheduler() {
  logger.info('🚀 支払いサイクル自動化スケジューラーを起動します');

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

  // 毎月1日 03:00 に繰越報酬スイープ（報酬計算の後に実行）
  cron.schedule('0 3 1 * *', async () => {
    await sweepCarriedForwardCommissions();
  });

  // 毎月1日 06:00 に支払い通知メール（報酬計算完了後）
  cron.schedule('0 6 1 * *', async () => {
    await sendPaymentReminders();
  });

  // 毎月25日 10:00 に支払い実行処理
  cron.schedule('0 10 25 * *', async () => {
    await processMonthlyPayments();
  });

  // 毎日 04:00 に期限切れリセットトークンのクリーンアップ
  cron.schedule('0 4 * * *', async () => {
    await cleanupExpiredResetTokens();
  });

  // 毎月1日 05:00 に解約済み代理店のデータクリーンアップ
  cron.schedule('0 5 1 * *', async () => {
    await cleanupTerminatedAgencies();
  });

  logger.info('✅ スケジューラーが起動しました');
  logger.info('⏰ 月次締め: 毎月末日 23:59');
  logger.info('⏰ 報酬計算: 毎月1日 02:00');
  logger.info('⏰ 繰越スイープ: 毎月1日 03:00');
  logger.info('⏰ 解約データ保持: 毎月1日 05:00');
  logger.info('⏰ 支払い通知: 毎月1日 06:00');
  logger.info('⏰ 支払い実行: 毎月25日 10:00');
  logger.info('⏰ バックアップ: 毎日 03:00');
  logger.info('⏰ トークンクリーンアップ: 毎日 04:00');
}

// このファイルが直接実行された場合
if (require.main === module) {
  startScheduler();

  // プロセスを維持
  process.on('SIGTERM', () => {
    logger.info('🛑 スケジューラーを停止します');
    process.exit(0);
  });
}

// エクスポート（server.jsから使用する場合）
module.exports = {
  startScheduler,
  monthlyClosing,
  calculateCommissions,
  sweepCarriedForwardCommissions,
  sendPaymentReminders,
  processMonthlyPayments,
  cleanupExpiredResetTokens,
  cleanupTerminatedAgencies
};
