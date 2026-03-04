/**
 * テスト用代理店アカウント作成スクリプト
 *
 * Supabase Auth + users + agencies テーブルにレコードを作成する。
 * 既存アカウントの場合はパスワードリセット。
 *
 * 使用方法:
 *   node src/scripts/create-agency-account.js [email] [password] [company_name]
 *
 * デフォルト:
 *   email: agency-test@agenttree.com
 *   password: AgencyTest1!
 *   company: テスト代理店株式会社
 */
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('create-agency');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 代理店コード生成（AGN + 西暦4桁 + 連番4桁）
async function generateAgencyCode() {
  const prefix = `AGN${new Date().getFullYear()}`;
  const { data, error } = await supabase
    .from('agencies')
    .select('agency_code')
    .like('agency_code', `${prefix}%`)
    .order('agency_code', { ascending: false })
    .limit(1);

  if (error) throw error;

  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = parseInt(data[0].agency_code.slice(-4));
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}

async function createAgencyAccount() {
  try {
    const email = process.argv[2] || 'agency-test@agenttree.com';
    const password = process.argv[3] || 'AgencyTest1!';
    const companyName = process.argv[4] || 'テスト代理店株式会社';

    // パスワード強度チェック
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      logger.error('パスワードが要件を満たしていません（8文字以上、大文字・小文字・数字・特殊文字）');
      process.exit(1);
    }

    logger.info('代理店テストアカウントを作成しています...');

    let userId;

    // 1. Supabase Auth でユーザー作成
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: companyName }
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        logger.info('⚠️  アカウントは既に存在します。パスワードをリセットします...');

        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users.users.find(u => u.email === email);
        if (!existingUser) throw new Error('既存ユーザーが見つかりません');

        userId = existingUser.id;

        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
        if (updateError) throw updateError;
        logger.info('✅ パスワードをリセットしました');

        // users テーブル更新
        await supabase.from('users').upsert({
          id: userId,
          email: email,
          full_name: companyName,
          password_hash: 'managed_by_supabase',
          role: 'agency',
          is_active: true
        });
        logger.info('✅ usersテーブルを更新しました');

        // agencies テーブルに既存レコードがあるか確認
        const { data: existingAgency } = await supabase
          .from('agencies')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingAgency) {
          logger.info('✅ agenciesテーブルのレコードは既に存在します');
        } else {
          // agencies レコード作成
          const agencyCode = await generateAgencyCode();
          const { error: agencyError } = await supabase.from('agencies').insert({
            user_id: userId,
            email: email,
            company_name: companyName,
            tier_level: 1,
            status: 'active',
            agency_code: agencyCode
          });
          if (agencyError) throw agencyError;
          logger.info(`✅ agenciesテーブルにレコードを作成しました (code: ${agencyCode})`);
        }
      } else {
        throw authError;
      }
    } else {
      userId = authData.user.id;
      logger.info('✅ Supabase Authでユーザーを作成しました');

      // パスワード再設定（createUserでセットされない場合の対策）
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, { password });
      if (pwError) logger.error('⚠️  パスワード再設定エラー:', pwError.message);

      // 2. users テーブルにレコード作成
      const { error: dbError } = await supabase.from('users').insert({
        id: userId,
        email: email,
        full_name: companyName,
        password_hash: 'managed_by_supabase',
        role: 'agency',
        is_active: true
      });

      if (dbError && dbError.code !== '23505') {
        logger.error('⚠️  usersテーブルへの挿入エラー:', dbError.message);
      } else {
        logger.info('✅ usersテーブルにレコードを作成しました');
      }

      // 3. agencies テーブルにレコード作成
      const agencyCode = await generateAgencyCode();
      const { error: agencyError } = await supabase.from('agencies').insert({
        user_id: userId,
        email: email,
        company_name: companyName,
        tier_level: 1,
        status: 'active',
        agency_code: agencyCode
      });

      if (agencyError && agencyError.code !== '23505') {
        logger.error('⚠️  agenciesテーブルへの挿入エラー:', agencyError.message);
      } else {
        logger.info(`✅ agenciesテーブルにレコードを作成しました (code: ${agencyCode})`);
      }
    }

    logger.info('');
    logger.info('代理店テストアカウントの作成が完了しました。');
    logger.info(`  Email: ${email}`);
    logger.info('  Role: agency');

  } catch (error) {
    logger.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

createAgencyAccount()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });
