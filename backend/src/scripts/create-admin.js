/**
 * 管理者アカウント作成スクリプト
 */
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('create-admin');

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
      logger.error('使用方法:');
      logger.error('  環境変数: ADMIN_EMAIL=xxx ADMIN_PASSWORD=xxx node src/scripts/create-admin.js');
      logger.error('  引数:     node src/scripts/create-admin.js <email> <password> [name]');
      logger.error('');
      logger.error('パスワード要件: 8文字以上、大文字・小文字・数字・特殊文字を含む');
      process.exit(1);
    }

    // パスワード強度の基本チェック
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      logger.error('パスワードが要件を満たしていません:');
      logger.error('  - 8文字以上');
      logger.error('  - 大文字・小文字・数字・特殊文字をそれぞれ1つ以上含む');
      process.exit(1);
    }

    logger.info('管理者アカウントを作成しています...');
    logger.info('');

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
        logger.info('⚠️  管理者アカウントは既に存在します');

        // 既存ユーザーのパスワードをリセット
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users.users.find(u => u.email === email);

        if (existingUser) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: password }
          );

          if (updateError) throw updateError;
          logger.info('✅ パスワードをリセットしました');

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
      logger.info('✅ Supabase Authでユーザーを作成しました');

      // createUserでパスワードが正しくセットされない場合があるため、updateUserByIdで再設定
      const { error: pwError } = await supabase.auth.admin.updateUserById(
        authData.user.id,
        { password: password }
      );
      if (pwError) {
        logger.error('⚠️  パスワード再設定エラー:', pwError.message);
      }

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
        logger.error('⚠️  usersテーブルへの挿入エラー:', dbError.message);
      } else {
        logger.info('✅ usersテーブルにレコードを作成しました');
      }
    }

    logger.info('');
    logger.info('管理者アカウントの作成が完了しました。');
    logger.info('(アカウント情報はセキュリティのためログに表示しません)');

  } catch (error) {
    logger.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

createAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });
