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

module.exports = { safeErrorMessage };
