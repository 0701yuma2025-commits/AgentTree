/**
 * コード生成ユーティリティ
 */

const { supabase } = require('../config/supabase');

/**
 * 代理店コード生成
 * 形式: AGN + 西暦4桁 + 連番4桁
 * 例: AGN20240001
 */
async function generateAgencyCode() {
  try {
    const year = new Date().getFullYear();
    const prefix = `AGN${year}`;

    // 今年の最新の代理店コードを取得
    const { data, error } = await supabase
      .from('agencies')
      .select('agency_code')
      .like('agency_code', `${prefix}%`)
      .order('agency_code', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastCode = data[0].agency_code;
      const lastNumber = parseInt(lastCode.slice(-4));
      nextNumber = lastNumber + 1;
    }

    // 4桁にゼロパディング
    const numberPart = nextNumber.toString().padStart(4, '0');
    return `${prefix}${numberPart}`;
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
    const prefix = `SL${year}${month}`;

    // 今月の最新の売上番号を取得
    const { data, error } = await supabase
      .from('sales')
      .select('sale_number')
      .like('sale_number', `${prefix}%`)
      .order('sale_number', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].sale_number;
      const lastSeq = parseInt(lastNumber.slice(-5));
      nextNumber = lastSeq + 1;
    }

    // 5桁にゼロパディング
    const numberPart = nextNumber.toString().padStart(5, '0');
    return `${prefix}${numberPart}`;
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
    const year = new Date().getFullYear();
    const prefix = `PROD${year}`;

    // 今年の最新の商品コードを取得
    const { data, error } = await supabase
      .from('products')
      .select('product_code')
      .like('product_code', `${prefix}%`)
      .order('product_code', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastCode = data[0].product_code;
      const lastNumber = parseInt(lastCode.slice(-4));
      nextNumber = lastNumber + 1;
    }

    // 4桁にゼロパディング
    const numberPart = nextNumber.toString().padStart(4, '0');
    return `${prefix}${numberPart}`;
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
    const prefix = `PAY${year}${month}`;

    // 今月の最新の支払い番号を取得
    const { data, error } = await supabase
      .from('payments')
      .select('payment_number')
      .like('payment_number', `${prefix}%`)
      .order('payment_number', { ascending: false })
      .limit(1);

    if (error && error.code !== 'PGRST116') throw error; // テーブルが存在しない場合は無視

    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].payment_number;
      const lastSeq = parseInt(lastNumber.slice(-4));
      nextNumber = lastSeq + 1;
    }

    // 4桁にゼロパディング
    const numberPart = nextNumber.toString().padStart(4, '0');
    return `${prefix}${numberPart}`;
  } catch (error) {
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