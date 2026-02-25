/**
 * 銀行振込データエクスポートユーティリティ
 */

const { Parser } = require('json2csv');
const iconv = require('iconv-lite');
const { sanitizeCsvValue } = require('./csvSanitizer');

/**
 * 全銀フォーマット（総合振込）用データを生成
 * @param {Array} payments - 支払いデータ配列
 * @param {Object} companyInfo - 振込元企業情報
 * @returns {String} 全銀フォーマットデータ
 */
function generateZenginFormat(payments, companyInfo) {
  const lines = [];
  const today = new Date();
  const dateStr = formatZenginDate(today);

  // ヘッダーレコード
  const header = [
    '1',                                    // データ区分（1: ヘッダー）
    '21',                                   // 種別コード（21: 総合振込）
    '0',                                    // コード区分（0: JIS）
    companyInfo.clientCode.padStart(10, '0'), // 依頼人コード
    convertToHalfWidth(companyInfo.clientName).padEnd(40, ' ').substring(0, 40), // 依頼人名
    dateStr,                               // 振込指定日（MMDD）
    companyInfo.bankCode.padStart(4, '0'),   // 仕向銀行番号
    convertToHalfWidth(companyInfo.bankName).padEnd(15, ' ').substring(0, 15), // 仕向銀行名
    companyInfo.branchCode.padStart(3, '0'), // 仕向支店番号
    convertToHalfWidth(companyInfo.branchName).padEnd(15, ' ').substring(0, 15), // 仕向支店名
    companyInfo.accountType === '普通' ? '1' : '2', // 預金種目（1: 普通、2: 当座）
    companyInfo.accountNumber.padStart(7, '0'), // 口座番号
    ' '.repeat(17)                         // ダミー
  ].join('');

  lines.push(header);

  // データレコード
  let totalAmount = 0;
  let recordCount = 0;

  payments.forEach((payment, index) => {
    if (!payment.bank_account || !payment.bank_account.bank_code) {
      console.warn(`支払い先 ${payment.agency_name} の銀行情報が不完全です`);
      return;
    }

    const dataRecord = [
      '2',                                    // データ区分（2: データ）
      payment.bank_account.bank_code.padStart(4, '0'),         // 被仕向銀行番号
      convertToHalfWidth(payment.bank_account.bank_name || '').padEnd(15, ' ').substring(0, 15), // 被仕向銀行名
      payment.bank_account.branch_code.padStart(3, '0'),       // 被仕向支店番号
      convertToHalfWidth(payment.bank_account.branch_name || '').padEnd(15, ' ').substring(0, 15), // 被仕向支店名
      ' '.repeat(4),                         // 手形交換所番号（未使用）
      payment.bank_account.account_type === '普通' ? '1' : '2', // 預金種目
      payment.bank_account.account_number.padStart(7, '0'),    // 口座番号
      convertToKatakana(payment.bank_account.account_holder || payment.agency_name).padEnd(30, ' ').substring(0, 30), // 受取人名（カタカナ）
      String(payment.final_amount).padStart(10, '0'),          // 振込金額
      '0',                                    // 新規コード（0: その他）
      ' '.repeat(20),                        // EDI情報（未使用）
      ' '.repeat(1),                         // 振込区分（未使用）
      ' '.repeat(6)                          // ダミー
    ].join('');

    lines.push(dataRecord);
    totalAmount += payment.final_amount;
    recordCount++;
  });

  // トレーラーレコード
  const trailer = [
    '8',                                    // データ区分（8: トレーラー）
    String(recordCount).padStart(6, '0'),   // 合計件数
    String(totalAmount).padStart(12, '0'),  // 合計金額
    ' '.repeat(101)                        // ダミー
  ].join('');

  lines.push(trailer);

  // エンドレコード
  const end = [
    '9',                                    // データ区分（9: エンド）
    ' '.repeat(119)                        // ダミー
  ].join('');

  lines.push(end);

  return lines.join('\r\n');
}

/**
 * CSV形式で振込データをエクスポート
 * @param {Array} payments - 支払いデータ配列
 * @returns {String} CSVデータ
 */
function generateCSVFormat(payments) {
  const fields = [
    { label: '支払日', value: 'payment_date' },
    { label: '代理店コード', value: 'agency_code' },
    { label: '代理店名', value: 'agency_name' },
    { label: '銀行名', value: 'bank_account.bank_name' },
    { label: '支店名', value: 'bank_account.branch_name' },
    { label: '口座種別', value: 'bank_account.account_type' },
    { label: '口座番号', value: 'bank_account.account_number' },
    { label: '口座名義', value: 'bank_account.account_holder' },
    { label: '基本報酬', value: 'base_amount' },
    { label: '階層ボーナス', value: 'tier_bonus' },
    { label: 'キャンペーンボーナス', value: 'campaign_bonus' },
    { label: 'インボイス控除', value: 'invoice_deduction' },
    { label: '源泉徴収', value: 'withholding_tax' },
    { label: '振込金額', value: 'final_amount' },
    { label: 'ステータス', value: 'status' }
  ];

  // 数式インジェクション対策: 文字列値をサニタイズ
  const sanitizedPayments = payments.map(p => {
    const sanitized = { ...p };
    sanitized.agency_code = sanitizeCsvValue(p.agency_code);
    sanitized.agency_name = sanitizeCsvValue(p.agency_name);
    sanitized.status = sanitizeCsvValue(p.status);
    if (p.bank_account) {
      sanitized.bank_account = {
        ...p.bank_account,
        bank_name: sanitizeCsvValue(p.bank_account.bank_name),
        branch_name: sanitizeCsvValue(p.bank_account.branch_name),
        account_type: sanitizeCsvValue(p.bank_account.account_type),
        account_number: sanitizeCsvValue(p.bank_account.account_number),
        account_holder: sanitizeCsvValue(p.bank_account.account_holder),
      };
    }
    return sanitized;
  });

  const json2csvParser = new Parser({ fields, withBOM: true });
  const csv = json2csvParser.parse(sanitizedPayments);

  return csv;
}

/**
 * 振込明細書形式でエクスポート（人間が読みやすい形式）
 * @param {Array} payments - 支払いデータ配列
 * @param {String} month - 対象月（YYYY-MM）
 * @returns {String} テキストデータ
 */
function generateReadableFormat(payments, month) {
  const lines = [];
  const today = new Date().toLocaleDateString('ja-JP');

  lines.push('=' .repeat(80));
  lines.push(`振込データ一覧`);
  lines.push(`対象月: ${month}`);
  lines.push(`作成日: ${today}`);
  lines.push('=' .repeat(80));
  lines.push('');

  // サマリー
  const totalAmount = payments.reduce((sum, p) => sum + p.final_amount, 0);
  const totalCount = payments.length;

  lines.push('【サマリー】');
  lines.push(`  対象件数: ${totalCount}件`);
  lines.push(`  振込総額: ¥${totalAmount.toLocaleString()}`);
  lines.push('');

  lines.push('-' .repeat(80));
  lines.push('【明細】');
  lines.push('-' .repeat(80));

  payments.forEach((payment, index) => {
    lines.push(`[${index + 1}] ${payment.agency_name} (${payment.agency_code})`);
    lines.push(`  振込先: ${payment.bank_account?.bank_name || 'N/A'} ${payment.bank_account?.branch_name || ''}`);
    lines.push(`  口座: ${payment.bank_account?.account_type || ''} ${payment.bank_account?.account_number || 'N/A'}`);
    lines.push(`  名義: ${payment.bank_account?.account_holder || payment.agency_name}`);
    lines.push('');
    lines.push(`  基本報酬:           ¥${payment.base_amount.toLocaleString()}`);
    if (payment.tier_bonus > 0) {
      lines.push(`  階層ボーナス:       ¥${payment.tier_bonus.toLocaleString()}`);
    }
    if (payment.campaign_bonus > 0) {
      lines.push(`  キャンペーンボーナス: ¥${payment.campaign_bonus.toLocaleString()}`);
    }
    if (payment.invoice_deduction > 0) {
      lines.push(`  インボイス控除:    -¥${payment.invoice_deduction.toLocaleString()}`);
    }
    if (payment.withholding_tax > 0) {
      lines.push(`  源泉徴収:          -¥${payment.withholding_tax.toLocaleString()}`);
    }
    lines.push(`  ${'─'.repeat(25)}`);
    lines.push(`  振込金額:           ¥${payment.final_amount.toLocaleString()}`);
    lines.push('');
    lines.push('-' .repeat(80));
  });

  lines.push('');
  lines.push('【振込金額合計】');
  lines.push(`  ¥${totalAmount.toLocaleString()}`);
  lines.push('');
  lines.push('=' .repeat(80));
  lines.push('以上');

  return lines.join('\n');
}

/**
 * 日付を全銀フォーマット用に変換（MMDD）
 */
function formatZenginDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return month + day;
}

/**
 * 全角文字を半角に変換
 */
function convertToHalfWidth(str) {
  if (!str) return '';
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

/**
 * ひらがな・漢字をカタカナに変換（簡易実装）
 * 実際の実装では、より高度な変換ライブラリを使用することを推奨
 */
function convertToKatakana(str) {
  if (!str) return '';
  // ひらがなをカタカナに変換
  return str.replace(/[\u3041-\u3096]/g, function(match) {
    const chr = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(chr);
  });
}

/**
 * 振込データをShift-JISに変換（銀行システム向け）
 */
function convertToShiftJIS(data) {
  return iconv.encode(data, 'Shift_JIS');
}

module.exports = {
  generateZenginFormat,
  generateCSVFormat,
  generateReadableFormat,
  convertToShiftJIS
};