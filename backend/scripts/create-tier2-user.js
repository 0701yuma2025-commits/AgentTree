/**
 * Tier2代理店用ユーザーアカウント作成スクリプト
 * neko代理店用のユーザーを作成
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createTier2User() {
  console.log('=== Tier2代理店ユーザー作成 ===\n');

  const email = 'n@g.com';
  const password = 'password123';

  try {
    // 1. Supabase Authでユーザー作成
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('Auth作成エラー:', authError);
      return;
    }

    console.log('✓ Authユーザー作成成功:', authData.user.id);

    // 2. usersテーブルにレコード作成
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        password_hash: 'managed_by_supabase',
        role: 'agency',
        full_name: 'ネコ代理店',
        is_active: true
      })
      .select()
      .single();

    if (userError) {
      console.error('Userレコード作成エラー:', userError);
      return;
    }

    console.log('✓ Userレコード作成成功');

    // 3. neko代理店の情報を確認
    const { data: agency } = await supabase
      .from('agencies')
      .select('*')
      .eq('company_name', 'neko')
      .single();

    if (agency) {
      console.log('\n=== 代理店情報 ===');
      console.log('会社名:', agency.company_name);
      console.log('階層: Tier', agency.tier_level);
      console.log('親代理店ID:', agency.parent_agency_id);
      console.log('ステータス:', agency.status);
    }

    console.log('\n=== ログイン情報 ===');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n✓ Tier2代理店ユーザーの作成が完了しました！');

  } catch (error) {
    console.error('予期しないエラー:', error);
  }
}

createTier2User();