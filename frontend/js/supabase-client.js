/**
 * Supabaseクライアント初期化
 */

// Supabase設定
const SUPABASE_URL = 'https://mcjqmpkafncbsgsosuyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1janFtcGthZm5jYnNnc29zdXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxODU1MTEsImV4cCI6MjA3Mzc2MTUxMX0.HpMQTw9JbUplEik7PGKRITsqbgWAbenTO2avvF4ucSg';

// Supabaseクライアント作成
if (typeof window !== 'undefined' && window.supabase) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error('Supabase library not loaded');
}