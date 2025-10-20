/**
 * 管理者アカウント作成スクリプト
 */
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createAdmin() {
  try {
    const email = 'admin@example.com';
    const password = 'Admin123';
    const fullName = 'System Admin';

    console.log('📝 管理者アカウントを作成しています...');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('');

    // Supabase Authでユーザーを作成
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        console.log('⚠️  管理者アカウントは既に存在します');

        // 既存ユーザーのパスワードをリセット
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users.users.find(u => u.email === email);

        if (existingUser) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: password }
          );

          if (updateError) throw updateError;
          console.log('✅ パスワードをリセットしました');

          // usersテーブルを更新
          await supabase
            .from('users')
            .upsert({
              id: existingUser.id,
              email: email,
              full_name: fullName,
              password_hash: 'managed_by_supabase',
              role: 'admin',
              is_active: true
            });
        }
      } else {
        throw authError;
      }
    } else {
      console.log('✅ Supabase Authでユーザーを作成しました');

      // usersテーブルにもレコードを作成
      const { error: dbError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          password_hash: 'managed_by_supabase',
          role: 'admin',
          is_active: true
        });

      if (dbError && dbError.code !== '23505') {
        console.error('⚠️  usersテーブルへの挿入エラー:', dbError.message);
      } else {
        console.log('✅ usersテーブルにレコードを作成しました');
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ログイン情報');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  URL: http://localhost:8000`);
    console.log(`  Email: admin@example.com`);
    console.log(`  Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

createAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
