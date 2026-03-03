/**
 * コード生成ユーティリティ
 * リトライ付きで同時リクエストによるコード重複を防止
 */

const { supabase } = require('../config/supabase');

const MAX_RETRIES = 5;

/**
 * 汎用コード生成（リトライ付き）
 * @param {Object} opts
 * @param {string} opts.table - テーブル名
 * @param {string} opts.column - コードカラム名
 * @param {string} opts.prefix - コードプレフィックス
 * @param {number} opts.padLength - 連番の桁数
 * @param {string} opts.errorMessage - エラーメッセージ
 * @returns {Promise<string>} 生成されたコード
 */
async function generateUniqueCode({ table, column, prefix, padLength, errorMessage }) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // 最新のコードを取得
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .like(column, `${prefix}%`)
      .order(column, { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastCode = data[0][column];
      const lastNumber = parseInt(lastCode.slice(-padLength));
      nextNumber = lastNumber + 1;
    }

    const numberPart = nextNumber.toString().padStart(padLength, '0');
    const code = `${prefix}${numberPart}`;

    // コードが既に存在しないか確認（レースウィンドウ縮小）
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq(column, code)
      .maybeSingle();

    if (!existing) return code;
    // 既に使われている場合、再クエリで最新のMAXを取得してリトライ
  }

  throw new Error(errorMessage);
}

/**
 * 代理店コード生成
 * 形式: AGN + 西暦4桁 + 連番4桁
 * 例: AGN20240001
 */
async function generateAgencyCode() {
  try {
    return await generateUniqueCode({
      table: 'agencies',
      column: 'agency_code',
      prefix: `AGN${new Date().getFullYear()}`,
      padLength: 4,
      errorMessage: '代理店コードの生成に失敗しました'
    });
  } catch (error) {
    console.error('Generate agency code error:', error);
    throw new Error('代理店コードの生成に失敗しました');
  }
}

/**
 * 売上番号生成
 * 形式: SL + 西暦4桁 + 月2桁 + 連番5桁
 * 例: SL202401000001
 */
async function generateSaleNumber() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    return await generateUniqueCode({
      table: 'sales',
      column: 'sale_number',
      prefix: `SL${year}${month}`,
      padLength: 5,
      errorMessage: '売上番号の生成に失敗しました'
    });
  } catch (error) {
    console.error('Generate sale number error:', error);
    throw new Error('売上番号の生成に失敗しました');
  }
}

/**
 * 商品コード生成
 * 形式: PROD + 西暦4桁 + 連番4桁
 * 例: PROD20240001
 */
async function generateProductCode() {
  try {
    return await generateUniqueCode({
      table: 'products',
      column: 'product_code',
      prefix: `PROD${new Date().getFullYear()}`,
      padLength: 4,
      errorMessage: '商品コードの生成に失敗しました'
    });
  } catch (error) {
    console.error('Generate product code error:', error);
    throw new Error('商品コードの生成に失敗しました');
  }
}

/**
 * 支払い番号生成
 * 形式: PAY + 西暦4桁 + 月2桁 + 連番4桁
 * 例: PAY2024010001
 */
async function generatePaymentNumber() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    return await generateUniqueCode({
      table: 'payments',
      column: 'payment_number',
      prefix: `PAY${year}${month}`,
      padLength: 4,
      errorMessage: '支払い番号の生成に失敗しました'
    });
  } catch (error) {
    if (error?.code === 'PGRST116') {
      // テーブル未存在の場合は初番号を返す
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      return `PAY${year}${month}0001`;
    }
    console.error('Generate payment number error:', error);
    throw new Error('支払い番号の生成に失敗しました');
  }
}

module.exports = {
  generateAgencyCode,
  generateSaleNumber,
  generateProductCode,
  generatePaymentNumber
};
