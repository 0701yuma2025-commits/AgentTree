/**
 * 支払い処理の詳細確認テスト
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const { processMonthlyPayments } = require('./cron-scheduler');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function detailedTest() {
  console.log('🧪 支払い処理の詳細テストを開始します\n');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. confirmed の上位5件をapprovedに変更
    console.log('📝 Step 1: テスト用データの準備\n');

    const { data: confirmedCommissions } = await supabase
      .from('commissions')
      .select(`
        id,
        final_amount,
        agencies(company_name)
      `)
      .eq('month', currentMonth)
      .eq('status', 'confirmed')
      .order('final_amount', { ascending: false })
      .limit(5);

    if (!confirmedCommissions || confirmedCommissions.length === 0) {
      console.log('⚠️  confirmedステータスのデータがありません');
      return;
    }

    console.log('🔄 以下の報酬をapprovedに変更します:\n');
    let totalToApprove = 0;
    confirmedCommissions.forEach(c => {
      console.log(`  - ${c.agencies.company_name}: ¥${c.final_amount.toLocaleString()}`);
      totalToApprove += c.final_amount;
    });
    console.log(`\n合計: ¥${totalToApprove.toLocaleString()}\n`);

    const { error: updateError } = await supabase
      .from('commissions')
      .update({ status: 'approved' })
      .in('id', confirmedCommissions.map(c => c.id));

    if (updateError) {
      console.error('❌ 更新エラー:', updateError);
      return;
    }

    console.log('✅ ステータスをapprovedに更新しました\n');

    // 2. 処理前の状態を記録
    console.log('📊 Step 2: 処理前の状態確認\n');

    const { data: beforePayments } = await supabase
      .from('payment_history')
      .select('id')
      .eq('payment_date', `${currentMonth}-25`);

    const beforeCount = beforePayments?.length || 0;
    console.log(`既存の payment_history 件数: ${beforeCount}\n`);

    // 3. 支払い処理実行
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💸 Step 3: 支払い処理を実行\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await processMonthlyPayments();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 4. 処理後の詳細確認
    console.log('📊 Step 4: 処理後の詳細確認\n');

    // 4-1. 支払い済み報酬の確認
    const { data: paidCommissions } = await supabase
      .from('commissions')
      .select(`
        id,
        final_amount,
        payment_date,
        agencies(company_name)
      `)
      .eq('month', currentMonth)
      .eq('status', 'paid')
      .eq('payment_date', `${currentMonth}-25`)
      .order('final_amount', { ascending: false });

    if (paidCommissions && paidCommissions.length > 0) {
      console.log(`✅ 今回支払い済みになった報酬: ${paidCommissions.length} 件\n`);
      let paidTotal = 0;
      paidCommissions.forEach(c => {
        console.log(`  ✓ ${c.agencies.company_name}: ¥${c.final_amount.toLocaleString()}`);
        paidTotal += c.final_amount;
      });
      console.log(`\n支払い合計: ¥${paidTotal.toLocaleString()}\n`);
    } else {
      console.log('⚠️  今回支払い済みになったデータがありません\n');
    }

    // 4-2. payment_history の確認
    const { data: newPayments } = await supabase
      .from('payment_history')
      .select(`
        *,
        agencies(company_name)
      `)
      .eq('payment_date', `${currentMonth}-25`)
      .order('created_at', { ascending: false });

    const afterCount = newPayments?.length || 0;
    const newCount = afterCount - beforeCount;

    if (newCount > 0) {
      console.log(`✅ payment_history に新規追加: ${newCount} 件\n`);
      newPayments.slice(0, newCount).forEach(p => {
        console.log(`📄 ${p.agencies.company_name}`);
        console.log(`   金額: ¥${p.amount.toLocaleString()}`);
        console.log(`   参照番号: ${p.reference_number}`);
        console.log(`   支払日: ${p.payment_date}`);
        console.log(`   備考: ${p.notes}\n`);
      });
    } else {
      console.log('⚠️  payment_history に新しい記録がありません\n');
    }

    // 4-3. 月別サマリー
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 Step 5: 月別サマリー\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: monthSummary } = await supabase
      .from('commissions')
      .select('status, final_amount')
      .eq('month', currentMonth);

    const summary = monthSummary.reduce((acc, c) => {
      acc[c.status] = acc[c.status] || { count: 0, total: 0 };
      acc[c.status].count++;
      acc[c.status].total += c.final_amount;
      return acc;
    }, {});

    console.log(`${currentMonth}月の報酬ステータス:\n`);
    Object.entries(summary).forEach(([status, data]) => {
      console.log(`  ${status}: ${data.count} 件 (¥${data.total.toLocaleString()})`);
    });

    console.log('\n🎉 詳細テスト完了！\n');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
  }
}

// テスト実行
detailedTest();
