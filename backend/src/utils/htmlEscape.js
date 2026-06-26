/**
 * HTMLエスケープユーティリティ
 * ユーザー入力をメールHTML等に埋め込む際のXSS/HTMLインジェクション対策
 */

/**
 * HTML特殊文字をエスケープする
 * @param {*} value - 任意の値（文字列化して処理）
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
