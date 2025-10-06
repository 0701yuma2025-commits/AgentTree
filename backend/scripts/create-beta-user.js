/**
 * 株式会社ベータシステム（Tier2）用ユーザーアカウント作成
 * 子と孫を持つTier2代理店
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createBetaUser() {
  console.log('=== 株式会社ベータシステム用ユーザー作成 ===\n');

  const email = 'suzuki@beta-sys.example.com';
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
        full_name: '鈴木太郎',
        is_active: true
      })
      .select()
      .single();

    if (userError) {
      console.error('Userレコード作成エラー:', userError);
      return;
    }

    console.log('✓ Userレコード作成成功');

    // 3. ベータシステムの階層構造を確認
    const { data: betaAgency } = await supabase
      .from('agencies')
      .select('*')
      .eq('company_name', '株式会社ベータシステム')
      .single();

    if (betaAgency) {
      console.log('\n=== 代理店情報 ===');
      console.log('会社名:', betaAgency.company_name);
      console.log('階層: Tier', betaAgency.tier_level);
      console.log('代理店コード:', betaAgency.agency_code);

      // 子代理店を確認
      const { data: children } = await supabase
        .from('agencies')
        .select('company_name, tier_level')
        .eq('parent_agency_id', betaAgency.id);

      if (children && children.length > 0) {
        console.log('\n配下の代理店:');
        for (const child of children) {
          console.log('  └ Tier' + child.tier_level + ': ' + child.company_name);

          // 孫代理店を確認
          const { data: childAgency } = await supabase
            .from('agencies')
            .select('id')
            .eq('company_name', child.company_name)
            .single();

          if (childAgency) {
            const { data: grandchildren } = await supabase
              .from('agencies')
              .select('company_name, tier_level')
              .eq('parent_agency_id', childAgency.id);

            if (grandchildren && grandchildren.length > 0) {
              grandchildren.forEach(gc => {
                console.log('      └ Tier' + gc.tier_level + ': ' + gc.company_name);
              });
            }
          }
        }
      }
    }

    console.log('\n=== ログイン情報 ===');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n✓ ベータシステム（Tier2）のユーザー作成が完了しました！');
    console.log('このアカウントでログインすると、配下のガンマコンサルティング（Tier3）と');
    console.log('デルタマーケティング（Tier4）のデータも管理できます。');

  } catch (error) {
    console.error('予期しないエラー:', error);
  }
}

createBetaUser();