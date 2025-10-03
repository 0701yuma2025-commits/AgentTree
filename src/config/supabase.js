/**
 * Supabase クライアント設定
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase URL と キーの検証（遅延評価）
function validateConfig() {
  if (!process.env.SUPABASE_URL) {
    console.error('Error: SUPABASE_URL is not set in environment variables');
    return false;
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('Error: SUPABASE_SERVICE_KEY is not set in environment variables');
    return false;
  }

  return true;
}

// Supabaseクライアントの遅延初期化
let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    if (!validateConfig()) {
      // エラーをログに記録し、nullを返す（サーバーをクラッシュさせない）
      console.error('Supabase client initialization failed due to missing configuration');
      return null;
    }

    try {
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      console.log('Supabase client initialized successfully');
    } catch (error) {
      console.error('Failed to create Supabase client:', error.message);
      return null;
    }
  }

  return supabase;
}

// 既存コードとの互換性のため、初回アクセス時に初期化を試みる
const supabaseProxy = new Proxy({}, {
  get: function(target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      console.error('Supabase client is not available');
      // エラーを投げずに、安全なダミーオブジェクトを返す
      return () => Promise.reject(new Error('Supabase client not initialized'));
    }
    return client[prop];
  }
});

module.exports = { supabase: supabaseProxy };