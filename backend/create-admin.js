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
    const email = process.env.ADMIN_EMAIL || process.argv[2];
    const password = process.env.ADMIN_PASSWORD || process.argv[3];
    const fullName = process.env.ADMIN_NAME || process.argv[4] || 'System Admin';

    if (!email || !password) {
      console.error('使用方法:');
      console.error('  環境変数: ADMIN_EMAIL=xxx ADMIN_PASSWORD=xxx node create-admin.js');
      console.error('  引数:     node create-admin.js <email> <password> [name]');
      console.error('');
      console.error('パスワード要件: 8文字以上、大文字・小文字・数字・特殊文字を含む');
      process.exit(1);
    }

    // パスワード強度の基本チェック
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      console.error('パスワードが要件を満たしていません:');
      console.error('  - 8文字以上');
      console.error('  - 大文字・小文字・数字・特殊文字をそれぞれ1つ以上含む');
      process.exit(1);
    }

    console.log('管理者アカウントを作成しています...');
    console.log(`Email: ${email}`);
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
    console.log('管理者アカウントの作成が完了しました。');
    console.log(`Email: ${email}`);
    console.log('(パスワードはセキュリティのため表示しません)');

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
