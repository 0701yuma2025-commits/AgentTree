/**
 * 支払い管理・振込データエクスポートAPI
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/errorHelper');

// エクスポート用レート制限（1分あたり5回まで）
const exportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'エクスポートのリクエスト回数が上限を超えました。1分後に再試行してください。' }
});
const {
  generateZenginFormat,
  generateCSVFormat,
  generateReadableFormat,
  convertToShiftJIS
} = require('../utils/bankExport');

/**
 * GET /api/payments/export
 * 振込データをエクスポート（管理者のみ）
 */
router.get('/export', authenticateToken, requireAdmin, exportRateLimit, async (req, res) => {
  try {
    const { month, format = 'csv', status = 'approved' } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: '対象月を指定してください'
      });
    }

    // 報酬データを取得（銀行口座情報を含む）
    const { data: commissions, error: commissionsError } = await supabase
      .from('commissions')
      .select(`
        *,
        agency:agencies(
          id,
          agency_code,
          company_name,
          bank_account,
          invoice_registered,
          withholding_tax_flag
        )
      `)
      .eq('month', month)
      .eq('status', status)
      .gte('final_amount', 10000); // 最低支払額以上

    if (commissionsError) throw commissionsError;

    // 代理店ごとに集計
    const paymentsByAgency = {};

    commissions.forEach(commission => {
      const agencyId = commission.agency_id;

      if (!paymentsByAgency[agencyId]) {
        paymentsByAgency[agencyId] = {
          agency_id: agencyId,
          agency_code: commission.agency?.agency_code,
          agency_name: commission.agency?.company_name,
          bank_account: commission.agency?.bank_account,
          base_amount: 0,
          tier_bonus: 0,
          campaign_bonus: 0,
          invoice_deduction: 0,
          withholding_tax: 0,
          final_amount: 0,
          commission_count: 0,
          payment_date: `${month}-25`, // デフォルト25日振込
          status: 'pending'
        };
      }

      paymentsByAgency[agencyId].base_amount += commission.base_amount || 0;
      paymentsByAgency[agencyId].tier_bonus += commission.tier_bonus || 0;
      paymentsByAgency[agencyId].campaign_bonus += commission.campaign_bonus || 0;
      paymentsByAgency[agencyId].invoice_deduction += commission.invoice_deduction || 0;
      paymentsByAgency[agencyId].withholding_tax += commission.withholding_tax || 0;
      paymentsByAgency[agencyId].final_amount += commission.final_amount || 0;
      paymentsByAgency[agencyId].commission_count++;
    });

    const payments = Object.values(paymentsByAgency);

    // 銀行口座情報がない代理店を警告（代理店名のみログ。口座情報はログに出さない）
    const missingBankInfo = payments.filter(p => !p.bank_account || !p.bank_account.bank_code);
    if (missingBankInfo.length > 0) {
      console.warn(`銀行口座情報が不完全な代理店: ${missingBankInfo.length}件`);
    }

    let exportData;
    let filename;
    let contentType;

    switch (format) {
      case 'zengin':
        // 全銀フォーマット
        const companyInfo = {
          clientCode: process.env.COMPANY_CLIENT_CODE || '0000000001',
          clientName: process.env.COMPANY_NAME || 'サンプル株式会社',
          bankCode: process.env.COMPANY_BANK_CODE || '0001',
          bankName: process.env.COMPANY_BANK_NAME || 'みずほ銀行',
          branchCode: process.env.COMPANY_BRANCH_CODE || '001',
          branchName: process.env.COMPANY_BRANCH_NAME || '東京営業部',
          accountType: process.env.COMPANY_ACCOUNT_TYPE || '普通',
          accountNumber: process.env.COMPANY_ACCOUNT_NUMBER || '1234567'
        };

        exportData = generateZenginFormat(payments, companyInfo);
        // Shift-JISに変換
        exportData = convertToShiftJIS(exportData);
        const safeMonthZengin = month.replace(/[^0-9]/g, '');
        filename = `transfer_${safeMonthZengin}.txt`;
        contentType = 'text/plain; charset=Shift_JIS';
        break;

      case 'readable':
        // 人間が読みやすい形式
        exportData = generateReadableFormat(payments, month);
        const safeMonthReadable = month.replace(/[^0-9-]/g, '');
        filename = `payment_details_${safeMonthReadable}.txt`;
        contentType = 'text/plain; charset=utf-8';
        break;

      case 'csv':
      default:
        // CSV形式（デフォルト）
        exportData = generateCSVFormat(payments);
        const safeMonthCsv = month.replace(/[^0-9-]/g, '');
        filename = `payments_${safeMonthCsv}.csv`;
        contentType = 'text/csv; charset=utf-8';
        break;
    }

    // ダウンロード用ヘッダーを設定
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // データを送信
    res.send(exportData);

  } catch (error) {
    console.error('Export payment data error:', error);
    res.status(500).json({
      success: false,
      message: 'エクスポートに失敗しました',
      error: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/payments/preview
 * 振込データのプレビュー（管理者のみ）
 */
router.get('/preview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { month, status = 'approved' } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: '対象月を指定してください'
      });
    }

    // 報酬データを取得
    const { data: commissions, error } = await supabase
      .from('commissions')
      .select(`
        *,
        agency:agencies(
          id,
          agency_code,
          company_name,
          bank_account,
          invoice_registered
        )
      `)
      .eq('month', month)
      .eq('status', status)
      .gte('final_amount', 10000);

    if (error) throw error;

    // 代理店ごとに集計
    const paymentsByAgency = {};

    commissions.forEach(commission => {
      const agencyId = commission.agency_id;

      if (!paymentsByAgency[agencyId]) {
        paymentsByAgency[agencyId] = {
          agency_id: agencyId,
          agency_code: commission.agency?.agency_code,
          agency_name: commission.agency?.company_name,
          bank_account: commission.agency?.bank_account,
          base_amount: 0,
          tier_bonus: 0,
          campaign_bonus: 0,
          invoice_deduction: 0,
          withholding_tax: 0,
          final_amount: 0,
          commission_ids: []
        };
      }

      paymentsByAgency[agencyId].base_amount += commission.base_amount || 0;
      paymentsByAgency[agencyId].tier_bonus += commission.tier_bonus || 0;
      paymentsByAgency[agencyId].campaign_bonus += commission.campaign_bonus || 0;
      paymentsByAgency[agencyId].invoice_deduction += commission.invoice_deduction || 0;
      paymentsByAgency[agencyId].withholding_tax += commission.withholding_tax || 0;
      paymentsByAgency[agencyId].final_amount += commission.final_amount || 0;
      paymentsByAgency[agencyId].commission_ids.push(commission.id);
    });

    const payments = Object.values(paymentsByAgency);

    // 統計情報
    const stats = {
      total_agencies: payments.length,
      total_amount: payments.reduce((sum, p) => sum + p.final_amount, 0),
      missing_bank_info: payments.filter(p => !p.bank_account || !p.bank_account.bank_code).length,
      average_payment: payments.length > 0
        ? payments.reduce((sum, p) => sum + p.final_amount, 0) / payments.length
        : 0
    };

    res.json({
      success: true,
      data: payments,
      stats,
      month
    });

  } catch (error) {
    console.error('Preview payment data error:', error);
    res.status(500).json({
      success: false,
      message: 'プレビューの取得に失敗しました',
      error: safeErrorMessage(error)
    });
  }
});

/**
 * POST /api/payments/confirm
 * 振込実行を確定（管理者のみ）
 */
router.post('/confirm', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { month, payment_date, agency_ids } = req.body;

    if (!month || !payment_date || !agency_ids || agency_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '必須パラメータが不足しています'
      });
    }

    // 該当する報酬を支払い済みに更新
    const { data, error } = await supabase
      .from('commissions')
      .update({
        status: 'paid',
        payment_date: payment_date,
        paid_at: new Date().toISOString(),
        paid_by: req.user.id
      })
      .eq('month', month)
      .eq('status', 'approved')
      .in('agency_id', agency_ids)
      .gte('final_amount', 10000)
      .select();

    if (error) throw error;

    // 支払い履歴を記録
    const paymentRecords = agency_ids.map(agency_id => ({
      agency_id,
      month,
      payment_date,
      status: 'completed',
      commission_count: data.filter(c => c.agency_id === agency_id).length,
      total_amount: data
        .filter(c => c.agency_id === agency_id)
        .reduce((sum, c) => sum + c.final_amount, 0),
      created_by: req.user.id
    }));

    const { error: recordError } = await supabase
      .from('payment_records')
      .insert(paymentRecords);

    if (recordError) {
      console.error('Payment record creation error:', recordError);
    }

    const response = {
      success: true,
      message: '支払いが確定されました',
      data: {
        updated_count: data?.length || 0,
        total_amount: data?.reduce((sum, c) => sum + c.final_amount, 0) || 0
      }
    };

    if (recordError) {
      response.warning = '支払いは確定されましたが、支払い履歴の記録に失敗しました。管理者に連絡してください。';
    }

    res.json(response);

  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: '支払い確定に失敗しました',
      error: safeErrorMessage(error)
    });
  }
});

module.exports = router;