/**
 * セキュリティSQL実行スクリプト
 * RLSポリシー + DB制約を適用
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runSQL(filePath, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`ファイル: ${filePath}`);

  const sql = fs.readFileSync(filePath, 'utf8');

  // exec_sql RPC で実行を試みる
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error(`exec_sql エラー:`, error.message);
    console.log('個別ステートメントで再試行します...');

    // SQL を個別ステートメントに分割して実行
    const statements = sql
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let success = 0;
    let failed = 0;

    for (const stmt of statements) {
      // コメントのみの行をスキップ
      const cleanStmt = stmt.replace(/--.*$/gm, '').trim();
      if (!cleanStmt) continue;

      const { error: stmtError } = await supabase.rpc('exec_sql', { sql_query: cleanStmt + ';' });
      if (stmtError) {
        // 既に存在するエラーは無視
        if (stmtError.message.includes('already exists') ||
            stmtError.message.includes('already_exists')) {
          console.log(`  [SKIP] 既に存在: ${cleanStmt.substring(0, 60)}...`);
          success++;
        } else {
          console.error(`  [FAIL] ${cleanStmt.substring(0, 60)}...`);
          console.error(`         ${stmtError.message}`);
          failed++;
        }
      } else {
        console.log(`  [OK]   ${cleanStmt.substring(0, 60)}...`);
        success++;
      }
    }

    console.log(`\n結果: ${success} 成功, ${failed} 失敗`);
    return failed === 0;
  }

  console.log('全ステートメント実行成功');
  return true;
}

async function main() {
  console.log('セキュリティマイグレーションを開始します...');
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);

  const dbDir = path.join(__dirname, '..', 'database');

  try {
    // 1. RLS ポリシー
    await runSQL(path.join(dbDir, 'security-rls-policies.sql'), 'RLS ポリシー設定');

    // 2. DB 制約
    await runSQL(path.join(dbDir, 'security-add-constraints.sql'), 'DB 制約追加');

    console.log('\n=== 完了 ===');
  } catch (err) {
    console.error('実行エラー:', err.message);
    process.exit(1);
  }
}

main();
