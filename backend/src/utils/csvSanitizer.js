/**
 * CSV数式インジェクション防止ユーティリティ
 *
 * Excelなどの表計算ソフトは =, +, -, @, \t, \r で始まるセルを
 * 数式として解釈するため、ユーザー入力をCSVに含める際にサニタイズが必要。
 */

/**
 * CSV値をサニタイズして数式インジェクションを防止
 * @param {*} value - サニタイズ対象の値
 * @returns {string} サニタイズ済みの値
 */
function sanitizeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // 数式として解釈される先頭文字をシングルクォートでエスケープ
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * オブジェクトの全文字列値をCSVサニタイズ
 * @param {Object} obj - サニタイズ対象のオブジェクト
 * @returns {Object} サニタイズ済みのオブジェクト
 */
function sanitizeCsvRow(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = typeof value === 'string' ? sanitizeCsvValue(value) : value;
  }
  return sanitized;
}

module.exports = { sanitizeCsvValue, sanitizeCsvRow };
