/**
 * 支払い処理の動作テスト
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processMonthlyPayments } = require('./src/scripts/cron-scheduler');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testPaymentProcess() {
  console.log('🧪 支払い処理のテストを開始します\n');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    console.log(`対象月: ${currentMonth}\n`);

    // 1. 現在の報酬データを確認
    console.log('📊 現在の報酬データを確認中...');
    const { data: commissions, error: commError } = await supabase
      .from('commissions')
      .select(`
        id,
        month,
        agency_id,
        final_amount,
        status,
        agencies(company_name)
      `)
      .eq('month', currentMonth)
      .order('status', { ascending: true });

    if (commError) {
      console.error('❌ データ取得エラー:', commError);
      return;
    }

    if (!commissions || commissions.length === 0) {
      console.log(`⚠️  ${currentMonth}月の報酬データがありません`);
      console.log('💡 テスト用データを作成しますか？ (Ctrl+Cで中止)');
      return;
    }

    console.log(`\n合計: ${commissions.length} 件の報酬データ\n`);

    // ステータス別に集計
    const statusGroups = commissions.reduce((acc, c) => {
      acc[c.status] = acc[c.status] || [];
      acc[c.status].push(c);
      return acc;
    }, {});

    Object.entries(statusGroups).forEach(([status, items]) => {
      const total = items.reduce((sum, c) => sum + c.final_amount, 0);
      console.log(`${status}: ${items.length} 件 (合計: ¥${total.toLocaleString()})`);
    });

    const approvedCommissions = statusGroups.approved || [];

    if (approvedCommissions.length === 0) {
      console.log('\n⚠️  approved ステータスの報酬がありません');
      console.log('💡 テスト用にconfirmedをapprovedに更新します\n');

      // 最初の3件をapprovedに変更
      const toApprove = commissions.filter(c => c.status === 'confirmed').slice(0, 3);

      if (toApprove.length > 0) {
        console.log(`\n🔄 ${toApprove.length} 件をapprovedに変更します...`);
        toApprove.forEach(c => {
          console.log(`  - ${c.agencies.company_name}: ¥${c.final_amount.toLocaleString()}`);
        });

        const { error: updateError } = await supabase
          .from('commissions')
          .update({ status: 'approved' })
          .in('id', toApprove.map(c => c.id));

        if (updateError) {
          console.error('❌ 更新エラー:', updateError);
          return;
        }

        console.log('✅ ステータス更新完了\n');
      } else {
        console.log('⚠️  更新可能なpendingデータもありません');
        return;
      }
    } else {
      console.log('\n✅ approved ステータスの報酬があります:');
      approvedCommissions.forEach(c => {
        console.log(`  - ${c.agencies.company_name}: ¥${c.final_amount.toLocaleString()}`);
      });
    }

    // 2. 支払い処理を実行
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💸 支払い処理を実行します...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await processMonthlyPayments();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 3. 結果を確認
    console.log('\n📊 処理結果を確認中...\n');

    const { data: afterCommissions } = await supabase
      .from('commissions')
      .select(`
        id,
        status,
        payment_date,
        final_amount,
        agencies(company_name)
      `)
      .eq('month', currentMonth)
      .eq('status', 'paid');

    if (afterCommissions && afterCommissions.length > 0) {
      console.log(`✅ ${afterCommissions.length} 件が支払い済みになりました:\n`);
      afterCommissions.forEach(c => {
        console.log(`  ✓ ${c.agencies.company_name}: ¥${c.final_amount.toLocaleString()} (支払日: ${c.payment_date})`);
      });
    } else {
      console.log('⚠️  支払い済みデータがありません');
    }

    // 4. payment_historyを確認
    const { data: paymentHistory } = await supabase
      .from('payment_history')
      .select(`
        *,
        agencies(company_name)
      `)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // 直近1分以内
      .order('created_at', { ascending: false });

    if (paymentHistory && paymentHistory.length > 0) {
      console.log(`\n📝 payment_history に ${paymentHistory.length} 件記録されました:\n`);
      paymentHistory.forEach(p => {
        console.log(`  📄 ${p.agencies.company_name}`);
        console.log(`     金額: ¥${p.amount.toLocaleString()}`);
        console.log(`     参照番号: ${p.reference_number}`);
        console.log(`     支払日: ${p.payment_date}\n`);
      });
    } else {
      console.log('\n⚠️  payment_history に新しい記録がありません');
    }

    console.log('\n🎉 テスト完了！\n');

  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
  }
}

// テスト実行
testPaymentProcess();
