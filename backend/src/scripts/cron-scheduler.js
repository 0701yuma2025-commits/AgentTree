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
  console.log('💰 報酬計算を開始します...');

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
      .lt('sale_date', nextMonthStr);

    if (salesError) throw salesError;

    if (!sales || sales.length === 0) {
      console.log('ℹ️  対象となる売上がありません');
      return;
    }

    console.log(`${sales.length} 件の売上を処理します`);

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

    // 既存の報酬データを削除
    const { error: deleteError } = await supabase
      .from('commissions')
      .delete()
      .eq('month', targetMonth);

    if (deleteError) throw deleteError;

    // 報酬計算
    const commissionsData = calculateMonthlyCommissions(sales, agencies, products, targetMonth, commissionSettings);

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
    console.error('❌ 報酬計算でエラーが発生しました:', error);

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
  console.log('🔄 繰越報酬のスイープ処理を開始します...');

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
      console.log('ℹ️  繰越対象の報酬がありません');
      return;
    }

    console.log(`${carriedCommissions.length} 件の繰越報酬を処理します`);

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
          console.error(`❌ ${agencyId} の繰越報酬更新に失敗:`, updateError);
          continue;
        }

        sweptCount += data.commissionIds.length;
        console.log(`✅ 代理店 ${agencyId}: ${data.commissionIds.length}件の繰越報酬を当月(${currentMonth})に統合 (合計: ¥${grandTotal.toLocaleString()})`);
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
          console.error(`❌ ${agencyId} の繰越報酬月更新に失敗:`, updateError);
          continue;
        }

        remainCount += data.commissionIds.length;
        console.log(`⏭️  代理店 ${agencyId}: 最低支払額未満のため繰越継続 (¥${grandTotal.toLocaleString()} < ¥${minimumPayment.toLocaleString()})`);
      }
    }

    console.log(`✅ 繰越スイープ完了: ${sweptCount}件統合, ${remainCount}件繰越継続`);

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
    console.error('❌ 繰越報酬スイープでエラーが発生しました:', error);

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

    console.log(`✅ ${sentCount} 件の通知メールを送信しました`);

  } catch (error) {
    console.error('❌ 支払い通知メール送信でエラーが発生しました:', error);
  }
}

/**
 * 月次支払い実行処理
 * 実行タイミング: 毎月25日 10:00
 */
async function processMonthlyPayments() {
  console.log('💸 月次支払い処理を開始します...');

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
      console.log('ℹ️  支払い対象の報酬がありません');
      return;
    }

    console.log(`${commissions.length} 件の報酬を処理します`);

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
        console.log(`⏭️  ${data.agency.company_name}: 最低支払額未満 (¥${data.total.toLocaleString()})`);
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
        console.error(`❌ ${data.agency.company_name} の報酬更新に失敗:`, updateError);
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
        console.error(`❌ ${data.agency.company_name} の支払い履歴記録に失敗:`, insertError);
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

      console.log(`✅ ${data.agency.company_name}: ¥${data.total.toLocaleString()}`);
    }

    console.log(`✅ ${processedCount} 社への支払い処理が完了しました (合計: ¥${totalAmount.toLocaleString()})`);

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
    console.error('❌ 月次支払い処理でエラーが発生しました:', error);

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
  console.log('🧹 期限切れパスワードリセットトークンのクリーンアップを開始します...');

  try {
    // password_reset_expiry が現在時刻より前のレコードを取得
    const { data: expiredAgencies, error: fetchError } = await supabase
      .from('agencies')
      .select('id')
      .not('password_reset_token', 'is', null)
      .lt('password_reset_expiry', new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!expiredAgencies || expiredAgencies.length === 0) {
      console.log('ℹ️  クリーンアップ対象のトークンがありません');
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

    console.log(`✅ ${ids.length} 件の期限切れリセットトークンをクリーンアップしました`);
  } catch (error) {
    console.error('❌ リセットトークンクリーンアップでエラーが発生しました:', error);
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

  // 毎月1日 03:00 に繰越報酬スイープ（報酬計算の後に実行）
  cron.schedule('0 3 1 * *', async () => {
    await sweepCarriedForwardCommissions();
  });

  // 毎月20日 09:00 に支払い通知メール
  cron.schedule('0 9 20 * *', async () => {
    await sendPaymentReminders();
  });

  // 毎月25日 10:00 に支払い実行処理
  cron.schedule('0 10 25 * *', async () => {
    await processMonthlyPayments();
  });

  // 日次バックアップ（毎日 03:00）
  cron.schedule('0 3 * * *', async () => {
    console.log('💾 日次バックアップ処理（未実装）');
  });

  // 毎日 04:00 に期限切れリセットトークンのクリーンアップ
  cron.schedule('0 4 * * *', async () => {
    await cleanupExpiredResetTokens();
  });

  console.log('✅ スケジューラーが起動しました');
  console.log('⏰ 月次締め: 毎月末日 23:59');
  console.log('⏰ 報酬計算: 毎月1日 02:00');
  console.log('⏰ 繰越スイープ: 毎月1日 03:00');
  console.log('⏰ 支払い通知: 毎月20日 09:00');
  console.log('⏰ 支払い実行: 毎月25日 10:00');
  console.log('⏰ バックアップ: 毎日 03:00');
  console.log('⏰ トークンクリーンアップ: 毎日 04:00');
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
  sweepCarriedForwardCommissions,
  sendPaymentReminders,
  processMonthlyPayments,
  cleanupExpiredResetTokens
};
