/**
 * エラーレスポンスヘルパー
 * 本番環境でDBやライブラリの内部エラーをクライアントに露出しない
 */

/**
 * catchブロックで使用するエラーレスポンスを生成
 * @param {Error} error - キャッチされたエラー
 * @param {string} fallbackMessage - クライアントに返す汎用メッセージ
 * @returns {{ message: string }} 安全なエラーメッセージオブジェクト
 */
function safeErrorMessage(error, fallbackMessage = 'サーバーエラーが発生しました') {
  if (process.env.NODE_ENV === 'development') {
    return error.message || fallbackMessage;
  }
  return fallbackMessage;
}

/**
 * DBエラーをユーザー向けのレスポンスに変換
 * PostgreSQLエラーコードに基づき適切なHTTPステータスとメッセージを返す
 * @param {Error} error - Supabase/PostgreSQLエラー
 * @param {string} fallbackMessage - フォールバックメッセージ
 * @returns {{ status: number, message: string } | null} マッチした場合のレスポンス情報、マッチしない場合null
 */
function handleDbError(error, fallbackMessage) {
  if (!error) return null;

  const code = error.code;
  const message = error.message || '';

  // 一意制約違反 (UNIQUE)
  if (code === '23505') {
    // 具体的なカラム名を抽出して日本語化
    const columnMap = {
      email: 'メールアドレス',
      agency_code: '代理店コード',
      product_code: '商品コード',
      sale_number: '売上番号',
      template_code: 'テンプレートコード',
      payment_number: '支払い番号',
      token: 'トークン'
    };

    for (const [col, label] of Object.entries(columnMap)) {
      if (message.includes(col)) {
        return { status: 409, message: `この${label}は既に使用されています` };
      }
    }
    return { status: 409, message: 'この値は既に登録済みです' };
  }

  // 外部キー制約違反
  if (code === '23503') {
    return { status: 400, message: '関連するデータが見つかりません。参照先のデータを確認してください' };
  }

  // 文字列長超過
  if (code === '22001') {
    return { status: 400, message: '入力値が長すぎます。文字数を減らしてください' };
  }

  // NOT NULL制約違反
  if (code === '23502') {
    return { status: 400, message: '必須項目が入力されていません' };
  }

  // CHECK制約違反
  if (code === '23514') {
    return { status: 400, message: '入力値が許容範囲外です' };
  }

  // レコード未検出 (Supabase PostgREST)
  if (code === 'PGRST116') {
    return { status: 404, message: 'データが見つかりません' };
  }

  return null;
}

module.exports = { safeErrorMessage, handleDbError };
