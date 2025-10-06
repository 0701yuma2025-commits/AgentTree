/**
 * 既存のユーザーロールを更新するスクリプト
 */

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function updateRoles() {
  try {
    console.log('ロールの更新を開始します...');

    // 1. adminで始まるメールアドレスを管理者に更新
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .update({ role: 'admin' })
      .ilike('email', 'admin%')
      .select();

    if (adminError) {
      console.error('管理者更新エラー:', adminError);
    } else {
      console.log(`管理者に更新: ${adminUsers?.length || 0}件`);
      adminUsers?.forEach(user => {
        console.log(`  - ${user.email} → admin`);
      });
    }

    // 2. viewerロールを代理店に更新
    const { data: viewerUsers, error: viewerError } = await supabase
      .from('users')
      .update({ role: 'agency' })
      .eq('role', 'viewer')
      .select();

    if (viewerError) {
      console.error('viewer更新エラー:', viewerError);
    } else {
      console.log(`viewerから代理店に更新: ${viewerUsers?.length || 0}件`);
      viewerUsers?.forEach(user => {
        console.log(`  - ${user.email} → agency`);
      });
    }

    // 3. その他のロールも代理店に更新（admin, super_admin, agency以外）
    const { data: otherUsers, error: otherError } = await supabase
      .from('users')
      .update({ role: 'agency' })
      .not('role', 'in', '(admin,super_admin,agency)')
      .select();

    if (otherError) {
      console.error('その他ロール更新エラー:', otherError);
    } else if (otherUsers?.length > 0) {
      console.log(`その他のロールから代理店に更新: ${otherUsers.length}件`);
      otherUsers.forEach(user => {
        console.log(`  - ${user.email} → agency`);
      });
    }

    // 4. 更新結果を確認
    const { data: allUsers, error: fetchError } = await supabase
      .from('users')
      .select('email, role')
      .order('role')
      .order('email');

    if (fetchError) {
      console.error('ユーザー取得エラー:', fetchError);
    } else {
      console.log('\n現在のユーザー一覧:');
      const adminList = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
      const agencyList = allUsers.filter(u => u.role === 'agency');

      console.log('管理者:');
      adminList.forEach(user => {
        console.log(`  - ${user.email} (${user.role})`);
      });

      console.log('代理店:');
      agencyList.forEach(user => {
        console.log(`  - ${user.email}`);
      });
    }

    console.log('\nロール更新が完了しました！');

  } catch (error) {
    console.error('エラー:', error);
  }
}

// スクリプト実行
updateRoles();