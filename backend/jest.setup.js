/**
 * Jest グローバルセットアップ（setupFiles: テストフレームワーク読込前に実行）
 * 環境変数デフォルト設定とコンソール出力抑制
 */

// テスト用の環境変数デフォルト設定
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

// テスト中のconsole出力を抑制（テスト出力をクリーンに保つ）
// setupFiles段階ではbeforeAll/afterAllが使えないので直接置換
console.error = () => {};
console.warn = () => {};
console.log = () => {};
