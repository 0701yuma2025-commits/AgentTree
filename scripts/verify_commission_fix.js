/**
 * Commission Fix Verification Script
 * 修正後の状況を再確認するスクリプト
 */

require('dotenv').config();
const { supabase } = require('../src/config/supabase');

async function verifyFix() {
    try {
        console.log('=== Commission Fix Verification ===');
        console.log('実行時刻:', new Date().toISOString());
        console.log('');

        // 1. final_amount < 10000 AND status != 'carried_forward' のレコードを確認
        console.log('1. 未修正レコードの確認...');
        const { data: unfixedData, error: unfixedError } = await supabase
            .from('commissions')
            .select('*')
            .lt('final_amount', 10000)
            .neq('status', 'carried_forward');

        if (unfixedError) {
            throw new Error(`未修正レコード確認に失敗: ${unfixedError.message}`);
        }

        console.log(`未修正レコード数: ${unfixedData.length}件`);

        // 2. status = 'carried_forward' AND carry_forward_reason = '最低支払額(¥10,000)未満' のレコードを確認
        console.log('');
        console.log('2. 修正済みレコードの確認...');
        const { data: fixedData, error: fixedError } = await supabase
            .from('commissions')
            .select('*')
            .eq('status', 'carried_forward')
            .eq('carry_forward_reason', '最低支払額(¥10,000)未満');

        if (fixedError) {
            throw new Error(`修正済みレコード確認に失敗: ${fixedError.message}`);
        }

        console.log(`修正済みレコード数: ${fixedData.length}件`);

        // 3. 全体のcommissionsテーブルの状況確認
        console.log('');
        console.log('3. 全体状況の確認...');
        const { data: allData, error: allError, count } = await supabase
            .from('commissions')
            .select('status', { count: 'exact' });

        if (allError) {
            throw new Error(`全体状況確認に失敗: ${allError.message}`);
        }

        // ステータス別の集計
        const statusCounts = allData.reduce((acc, record) => {
            acc[record.status] = (acc[record.status] || 0) + 1;
            return acc;
        }, {});

        console.log('ステータス別レコード数:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  - ${status}: ${count}件`);
        });

        console.log(`総レコード数: ${count}件`);

        // 4. 結果サマリー
        console.log('');
        console.log('=== 検証結果サマリー ===');
        if (unfixedData.length === 0) {
            console.log('✅ 修正完了: final_amount < 10000 で未処理のレコードはありません');
        } else {
            console.log(`⚠️  未修正レコードが ${unfixedData.length}件 見つかりました`);
            console.log('未修正レコード詳細:');
            unfixedData.forEach(record => {
                console.log(`  - ID: ${record.id}, final_amount: ${record.final_amount}, status: ${record.status}`);
            });
        }

        console.log(`修正済みレコード: ${fixedData.length}件`);
        console.log('');
        console.log('検証完了時刻:', new Date().toISOString());

    } catch (error) {
        console.error('❌ 検証エラー:', error.message);
        console.error('スタックトレース:', error.stack);
        process.exit(1);
    }
}

// スクリプト実行
verifyFix();