/**
 * Commission Status Fix Script
 *
 * このスクリプトは以下を実行します：
 * 1. 修正前の状態をバックアップログに記録
 * 2. final_amount < 10000 のレコードを 'carried_forward' ステータスに更新
 * 3. 修正結果を確認・報告
 */

require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        console.log('=== Commission Status Fix Script ===');
        console.log('開始時刻:', new Date().toISOString());
        console.log('');

        // 1. 修正前の状態をバックアップとして記録
        console.log('1. 修正前の状態をバックアップ中...');

        const { data: beforeData, error: beforeError } = await supabase
            .from('commissions')
            .select('*')
            .lt('final_amount', 10000)
            .neq('status', 'carried_forward');

        if (beforeError) {
            throw new Error(`修正前データの取得に失敗: ${beforeError.message}`);
        }

        // バックアップログファイルに記録
        const backupLog = {
            timestamp: new Date().toISOString(),
            description: '修正前の状態（final_amount < 10000 AND status != carried_forward）',
            recordCount: beforeData.length,
            records: beforeData
        };

        const logDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFileName = `commission_fix_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const logFilePath = path.join(logDir, logFileName);

        fs.writeFileSync(logFilePath, JSON.stringify(backupLog, null, 2));
        console.log(`  - バックアップファイル作成: ${logFilePath}`);
        console.log(`  - 修正対象レコード数: ${beforeData.length}件`);
        console.log('');

        // 修正対象がない場合は終了
        if (beforeData.length === 0) {
            console.log('修正対象のレコードが見つかりませんでした。');
            return;
        }

        // 2. SQLクエリを実行してレコードを修正
        console.log('2. レコードを修正中...');

        const { data: updateData, error: updateError } = await supabase
            .from('commissions')
            .update({
                status: 'carried_forward',
                carry_forward_reason: '最低支払額(¥10,000)未満'
            })
            .lt('final_amount', 10000)
            .neq('status', 'carried_forward')
            .select();

        if (updateError) {
            throw new Error(`レコード更新に失敗: ${updateError.message}`);
        }

        console.log(`  - 更新されたレコード数: ${updateData ? updateData.length : 0}件`);
        console.log('');

        // 3. 修正結果を確認
        console.log('3. 修正結果を確認中...');

        const { data: afterData, error: afterError } = await supabase
            .from('commissions')
            .select('*')
            .lt('final_amount', 10000)
            .neq('status', 'carried_forward');

        if (afterError) {
            throw new Error(`修正後データの確認に失敗: ${afterError.message}`);
        }

        console.log(`  - 修正後の未処理レコード数: ${afterData.length}件`);

        // 4. 結果レポートを作成
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                修正前レコード数: beforeData.length,
                更新されたレコード数: updateData ? updateData.length : 0,
                修正後未処理レコード数: afterData.length
            },
            updatedRecords: updateData || [],
            remainingIssues: afterData
        };

        const reportFileName = `commission_fix_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const reportFilePath = path.join(logDir, reportFileName);

        fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2));
        console.log(`  - レポートファイル作成: ${reportFilePath}`);
        console.log('');

        // 5. 結果サマリー
        console.log('=== 修正完了サマリー ===');
        console.log(`修正前レコード数: ${beforeData.length}件`);
        console.log(`更新されたレコード数: ${updateData ? updateData.length : 0}件`);
        console.log(`修正後未処理レコード数: ${afterData.length}件`);

        if (afterData.length === 0) {
            console.log('✅ すべてのレコードが正常に修正されました。');
        } else {
            console.log('⚠️  一部のレコードが未処理のままです。詳細はレポートファイルを確認してください。');
        }

        console.log('');
        console.log('完了時刻:', new Date().toISOString());

    } catch (error) {
        console.error('❌ エラーが発生しました:', error.message);
        console.error('スタックトレース:', error.stack);
        process.exit(1);
    }
}

// スクリプト実行
main();