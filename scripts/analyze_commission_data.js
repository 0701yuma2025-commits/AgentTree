#!/usr/bin/env node

/**
 * 報酬データ分析スクリプト
 * final_amount < 10000 AND status != 'carried_forward' のレコードを検索し、詳細分析を実行
 */

// 必要なパッケージをロード
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabaseクライアントを初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * 問題のある報酬レコードを検索
 */
async function findProblematicCommissions() {
  console.log('=== 報酬データ分析開始 ===');
  console.log('条件: final_amount < 10000 AND status != \'carried_forward\'');
  console.log('');

  try {
    // 問題のあるレコードを検索
    const { data: problematicRecords, error } = await supabase
      .from('commissions')
      .select(`
        id,
        agency_id,
        month,
        base_amount,
        tier_bonus,
        campaign_bonus,
        final_amount,
        status,
        carry_forward_reason,
        created_at,
        updated_at,
        sale_id,
        tier_level,
        withholding_tax,
        agencies!inner(
          id,
          company_name,
          tier_level,
          company_type,
          invoice_registered,
          status
        )
      `)
      .lt('final_amount', 10000)
      .neq('status', 'carried_forward')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    console.log(`問題のあるレコード数: ${problematicRecords.length} 件`);
    console.log('');

    if (problematicRecords.length === 0) {
      console.log('✅ 問題のあるレコードは見つかりませんでした。');
      return;
    }

    // 詳細分析を実行
    await analyzeProblematicRecords(problematicRecords);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

/**
 * 問題のあるレコードの詳細分析
 */
async function analyzeProblematicRecords(records) {
  console.log('=== 詳細分析結果 ===');

  // ステータス別の分布
  const statusDistribution = {};
  const monthDistribution = {};
  const agencyDistribution = {};
  const amountRanges = {
    '0円': 0,
    '1-1000円': 0,
    '1001-5000円': 0,
    '5001-9999円': 0
  };

  records.forEach(record => {
    // ステータス分布
    statusDistribution[record.status] = (statusDistribution[record.status] || 0) + 1;

    // 月別分布
    monthDistribution[record.month] = (monthDistribution[record.month] || 0) + 1;

    // 代理店別分布
    const agencyKey = `${record.agencies.company_name} (ID: ${record.agency_id})`;
    agencyDistribution[agencyKey] = (agencyDistribution[agencyKey] || 0) + 1;

    // 金額範囲分布
    const amount = record.final_amount;
    if (amount === 0) {
      amountRanges['0円']++;
    } else if (amount <= 1000) {
      amountRanges['1-1000円']++;
    } else if (amount <= 5000) {
      amountRanges['1001-5000円']++;
    } else {
      amountRanges['5001-9999円']++;
    }
  });

  console.log('📊 ステータス別分布:');
  Object.entries(statusDistribution).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} 件`);
  });
  console.log('');

  console.log('📅 月別分布:');
  Object.entries(monthDistribution)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([month, count]) => {
      console.log(`  ${month}: ${count} 件`);
    });
  console.log('');

  console.log('💰 金額範囲別分布:');
  Object.entries(amountRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} 件`);
  });
  console.log('');

  console.log('🏢 代理店別分布 (上位10社):');
  Object.entries(agencyDistribution)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([agency, count]) => {
      console.log(`  ${agency}: ${count} 件`);
    });
  console.log('');

  // 詳細レコード表示（最新10件）
  console.log('📋 最新の問題レコード詳細 (10件):');
  console.log('ID\t\t代理店名\t\t月\t\t最終金額\tステータス\t作成日時');
  console.log('─'.repeat(100));

  records.slice(0, 10).forEach(record => {
    const agencyName = record.agencies.company_name.padEnd(15);
    const finalAmount = `¥${record.final_amount.toLocaleString()}`.padEnd(10);
    const createdAt = new Date(record.created_at).toLocaleString('ja-JP');

    console.log(`${record.id}\t${agencyName}\t${record.month}\t\t${finalAmount}\t${record.status}\t\t${createdAt}`);
  });
  console.log('');

  // 問題の原因推測
  await analyzeProblemCauses(records);
}

/**
 * 問題の原因推測
 */
async function analyzeProblemCauses(records) {
  console.log('🔍 問題の原因分析:');
  console.log('');

  // 各レコードについて、売上データとの関連を調査
  const sampleRecords = records.slice(0, 5); // 最新5件をサンプル調査

  for (const record of sampleRecords) {
    console.log(`📄 レコード ID: ${record.id}`);
    console.log(`   代理店: ${record.agencies.company_name} (Tier ${record.tier_level})`);
    console.log(`   対象月: ${record.month}`);
    console.log(`   最終金額: ¥${record.final_amount.toLocaleString()}`);
    console.log(`   内訳: 基本報酬¥${record.base_amount.toLocaleString()}, 階層ボーナス¥${record.tier_bonus.toLocaleString()}, キャンペーン¥${record.campaign_bonus.toLocaleString()}`);
    console.log(`   源泉徴収: ¥${record.withholding_tax || 0}`);
    console.log(`   ステータス: ${record.status}`);

    // 関連する売上データを取得
    if (record.sale_id) {
      try {
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .select('id, sale_number, total_amount, sale_date, status')
          .eq('id', record.sale_id)
          .single();

        if (saleError) {
          console.log(`   ⚠️ 売上データ取得エラー: ${saleError.message}`);
        } else if (saleData) {
          console.log(`   📊 関連売上: ${saleData.sale_number} (¥${saleData.total_amount.toLocaleString()}) - ${saleData.status}`);

          // 報酬計算の妥当性をチェック
          const expectedBaseRate = getExpectedCommissionRate(record.tier_level);
          const expectedBase = Math.floor(saleData.total_amount * expectedBaseRate / 100);

          if (record.base_amount !== expectedBase) {
            console.log(`   ⚠️ 基本報酬計算の不整合: 期待値¥${expectedBase.toLocaleString()}, 実際¥${record.base_amount.toLocaleString()}`);
          }
        }
      } catch (err) {
        console.log(`   ❌ 売上データ調査中にエラー: ${err.message}`);
      }
    } else {
      console.log(`   ⚠️ sale_id が設定されていません`);
    }

    // 代理店情報の詳細
    console.log(`   🏢 代理店詳細: ${record.agencies.company_type}, インボイス登録: ${record.agencies.invoice_registered ? 'あり' : 'なし'}`);

    console.log('');
  }

  // 推測される原因をまとめ
  console.log('🎯 推測される問題の原因:');
  console.log('');

  let hasZeroAmountRecords = records.some(r => r.final_amount === 0);
  let hasSmallAmountRecords = records.some(r => r.final_amount > 0 && r.final_amount < 1000);
  let hasInvoiceDeductionIssues = records.some(r => !r.agencies.invoice_registered);
  let hasWithholdingTaxIssues = records.some(r => r.withholding_tax > 0);

  if (hasZeroAmountRecords) {
    console.log('1. ゼロ円報酬レコード:');
    console.log('   - 階層ボーナスのみで基本報酬がない場合');
    console.log('   - インボイス控除や源泉徴収により最終金額がゼロになった場合');
    console.log('   - 計算エラーやデータ不整合の可能性');
    console.log('');
  }

  if (hasSmallAmountRecords) {
    console.log('2. 少額報酬レコード:');
    console.log('   - 小額の売上に対する報酬');
    console.log('   - インボイス控除（2%）や源泉徴収（10.21%）の影響');
    console.log('   - 階層ボーナスのみのレコード');
    console.log('');
  }

  if (hasInvoiceDeductionIssues) {
    console.log('3. インボイス未登録事業者の影響:');
    console.log('   - インボイス未登録の代理店には2%の控除が適用される');
    console.log('   - 小額の基本報酬から控除されると最終金額が大幅に減少');
    console.log('');
  }

  if (hasWithholdingTaxIssues) {
    console.log('4. 源泉徴収の影響:');
    console.log('   - 個人事業主には10.21%の源泉徴収が適用される');
    console.log('   - 小額の報酬では源泉徴収後の金額が著しく小さくなる');
    console.log('');
  }

  console.log('5. システム上の問題可能性:');
  console.log('   - 最低支払額（¥10,000）チェックが正しく動作していない');
  console.log('   - carried_forwardステータスが正しく設定されていない');
  console.log('   - 計算ロジックのバグ或いは例外処理の不備');
  console.log('');
}

/**
 * 期待される報酬率を取得（デフォルト値）
 */
function getExpectedCommissionRate(tierLevel) {
  const rates = {
    1: 10.00,
    2: 8.00,
    3: 6.00,
    4: 4.00
  };
  return rates[tierLevel] || 4.00;
}

/**
 * 補足分析
 */
async function performSupplementaryAnalysis() {
  console.log('=== 補足分析 ===');

  try {
    // 1. 正常な繰り越しレコードの確認
    const { data: carriedForwardRecords, error: cfError } = await supabase
      .from('commissions')
      .select('id, agency_id, month, final_amount, carry_forward_reason')
      .eq('status', 'carried_forward')
      .order('created_at', { ascending: false })
      .limit(10);

    if (cfError) throw cfError;

    console.log(`✅ 正常な繰り越しレコード数（最新10件）: ${carriedForwardRecords.length} 件`);
    if (carriedForwardRecords.length > 0) {
      console.log('   繰り越し理由の例:');
      carriedForwardRecords.slice(0, 3).forEach(record => {
        console.log(`   - ID ${record.id}: ¥${record.final_amount.toLocaleString()} - ${record.carry_forward_reason || '理由なし'}`);
      });
    }
    console.log('');

    // 2. 全体的な報酬分布の確認
    const { data: allCommissions, error: allError } = await supabase
      .from('commissions')
      .select('final_amount, status')
      .order('final_amount', { ascending: true });

    if (allError) throw allError;

    const totalRecords = allCommissions.length;
    const under10k = allCommissions.filter(r => r.final_amount < 10000).length;
    const carriedForward = allCommissions.filter(r => r.status === 'carried_forward').length;
    const problematic = allCommissions.filter(r => r.final_amount < 10000 && r.status !== 'carried_forward').length;

    console.log('📈 全体統計:');
    console.log(`   総報酬レコード数: ${totalRecords.toLocaleString()} 件`);
    console.log(`   ¥10,000未満のレコード: ${under10k.toLocaleString()} 件 (${(under10k/totalRecords*100).toFixed(1)}%)`);
    console.log(`   繰り越しレコード: ${carriedForward.toLocaleString()} 件 (${(carriedForward/totalRecords*100).toFixed(1)}%)`);
    console.log(`   問題のあるレコード: ${problematic.toLocaleString()} 件 (${(problematic/totalRecords*100).toFixed(1)}%)`);
    console.log('');

  } catch (error) {
    console.error('補足分析中にエラー:', error);
  }
}

/**
 * メイン実行関数
 */
async function main() {
  try {
    await findProblematicCommissions();
    await performSupplementaryAnalysis();

    console.log('=== 分析完了 ===');
    console.log('');
    console.log('📝 推奨アクション:');
    console.log('1. 問題のあるレコードのステータスをcarried_forwardに変更');
    console.log('2. 最低支払額チェックロジックの修正');
    console.log('3. インボイス控除と源泉徴収の計算ロジック見直し');
    console.log('4. 小額報酬の扱いに関するビジネスルール明確化');

  } catch (error) {
    console.error('実行中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = {
  findProblematicCommissions,
  analyzeProblematicRecords
};