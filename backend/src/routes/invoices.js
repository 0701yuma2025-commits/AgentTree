/**
 * 請求書・領収書関連のAPIエンドポイント
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { generateInvoicePDF, generateReceiptPDF, generatePaymentStatementPDF } = require('../utils/pdf-generator');

/**
 * 請求書PDF生成
 * POST /api/invoices/generate
 */
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { commission_id, month } = req.body;

    if (!commission_id && !month) {
      return res.status(400).json({ error: '報酬IDまたは対象月を指定してください' });
    }

    // 報酬データ取得
    let query = supabase
      .from('commissions')
      .select(`
        *,
        agencies(
          id,
          company_name,
          agency_code,
          address,
          contact_email,
          bank_account,
          bank_name,
          branch_name,
          account_type,
          account_number,
          account_holder
        ),
        sales(
          sale_number,
          product_id,
          total_amount
        )
      `);

    if (commission_id) {
      query = query.eq('id', commission_id);
    } else {
      query = query.eq('month', month)
        .eq('agency_id', req.user.agency?.id);
    }

    const { data: commission, error } = await query.single();

    if (error) {
      console.error('報酬データ取得エラー:', error);
      return res.status(404).json({ error: '報酬データが見つかりません' });
    }

    // 控除項目を計算詳細から取得、またはfinal_amountから逆算
    const calculationDetails = commission.calculation_details || {};
    let invoiceDeduction = calculationDetails.invoice_deduction || 0;
    let invoiceDeductionRate = calculationDetails.invoice_deduction_rate || 0;

    // calculation_detailsがない場合、金額差から控除を推定
    if (!invoiceDeduction && calculationDetails.invoice_deduction === undefined) {
      const expectedAmount = commission.base_amount + commission.tier_bonus + (commission.campaign_bonus || 0) - (commission.withholding_tax || 0);
      const actualAmount = commission.final_amount;
      const difference = expectedAmount - actualAmount;

      if (difference > 0) {
        invoiceDeduction = difference;
        // 基本報酬ベースで控除率を推定（通常2%）
        const baseForDeduction = commission.base_amount + commission.tier_bonus + (commission.campaign_bonus || 0);
        if (baseForDeduction > 0) {
          invoiceDeductionRate = Math.round((difference / baseForDeduction) * 100);
        }
      }
    }

    // 詳細項目を構築
    const items = [];

    // 基本報酬
    if (commission.base_amount > 0) {
      items.push({
        description: '基本報酬',
        quantity: 1,
        unitPrice: commission.base_amount,
        amount: commission.base_amount
      });
    }

    // 階層ボーナス
    if (commission.tier_bonus > 0) {
      items.push({
        description: '階層ボーナス',
        quantity: 1,
        unitPrice: commission.tier_bonus,
        amount: commission.tier_bonus
      });
    }

    // キャンペーンボーナス
    if (commission.campaign_bonus > 0) {
      items.push({
        description: 'キャンペーンボーナス',
        quantity: 1,
        unitPrice: commission.campaign_bonus,
        amount: commission.campaign_bonus
      });
    }

    // インボイス未登録控除
    if (invoiceDeduction > 0) {
      items.push({
        description: `インボイス未登録控除 (${invoiceDeductionRate}%)`,
        quantity: 1,
        unitPrice: -invoiceDeduction,
        amount: -invoiceDeduction
      });
    }

    // 源泉徴収税
    if (commission.withholding_tax > 0) {
      items.push({
        description: '源泉徴収税',
        quantity: 1,
        unitPrice: -commission.withholding_tax,
        amount: -commission.withholding_tax
      });
    }

    // 請求書データ構築
    const invoiceData = {
      invoiceNumber: `INV-${commission.month.replace('-', '')}-${commission.agency_id}`,
      issueDate: new Date().toLocaleDateString('ja-JP'),
      dueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleDateString('ja-JP'),
      agency: commission.agencies,
      items: items,
      subtotal: commission.base_amount + commission.tier_bonus + (commission.campaign_bonus || 0),
      tax: 0, // 報酬は非課税
      deductions: (invoiceDeduction || 0) + (commission.withholding_tax || 0),
      totalAmount: commission.final_amount,
      bankInfo: commission.agencies.bank_name ? {
        bankName: commission.agencies.bank_name,
        branchName: commission.agencies.branch_name,
        accountType: commission.agencies.account_type,
        accountNumber: commission.agencies.account_number,
        accountName: commission.agencies.account_holder
      } : null,
      notes: commission.carry_forward > 0
        ? `前月繰越額: ¥${commission.carry_forward.toLocaleString()}`
        : null
    };

    // PDF生成
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // レスポンス
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice_${commission.month}_${commission.agency_id}.pdf"`
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('請求書生成エラー:', error);
    res.status(500).json({ error: '請求書の生成に失敗しました' });
  }
});

/**
 * 領収書PDF生成
 * POST /api/invoices/receipt
 */
router.post('/receipt', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ error: '支払いIDを指定してください' });
    }

    // 支払いデータ取得
    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        commissions(
          *,
          agencies(
            company_name,
            agency_code
          )
        )
      `)
      .eq('id', payment_id)
      .single();

    if (error) {
      console.error('支払いデータ取得エラー:', error);
      return res.status(404).json({ error: '支払いデータが見つかりません' });
    }

    // 領収書データ構築
    const receiptData = {
      receiptNumber: `RCP-${payment.payment_date.replace(/-/g, '')}-${payment.id}`,
      issueDate: new Date().toLocaleDateString('ja-JP'),
      agency: payment.commissions.agencies,
      amount: payment.payment_amount,
      description: `${payment.commissions.month} 営業代理店報酬`,
      breakdown: [
        {
          label: '基本報酬',
          amount: payment.commissions.base_amount
        },
        {
          label: '階層ボーナス',
          amount: payment.commissions.tier_bonus
        }
      ],
      invoiceRegistrationNumber: '1234567890123'
    };

    if (payment.commissions.withholding_tax > 0) {
      receiptData.breakdown.push({
        label: '源泉徴収税',
        amount: -payment.commissions.withholding_tax
      });
    }

    // PDF生成
    const pdfBuffer = await generateReceiptPDF(receiptData);

    // レスポンス
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt_${payment.payment_date}_${payment.id}.pdf"`
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('領収書生成エラー:', error);
    res.status(500).json({ error: '領収書の生成に失敗しました' });
  }
});


/**
 * 管理者向け代理店別月次集計明細書PDF生成
 * POST /api/invoices/admin-monthly-summary
 */
router.post('/admin-monthly-summary', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '管理者権限が必要です' });
    }

    const { agency_id, month } = req.body;

    if (!agency_id || !month) {
      return res.status(400).json({ error: '代理店IDと対象月を指定してください' });
    }

    // 代理店情報取得
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', agency_id)
      .single();

    if (agencyError) {
      return res.status(404).json({ error: '代理店が見つかりません' });
    }

    // 対象月の全報酬データ取得（統合版）
    const { data: commissions, error: commissionsError } = await supabase
      .from('commissions')
      .select(`
        *,
        sales(
          sale_number,
          product_id,
          total_amount,
          sale_date
        )
      `)
      .eq('agency_id', agency_id)
      .eq('month', month)
      .order('created_at', { ascending: true });

    if (commissionsError) {
      console.error('報酬データ取得エラー:', commissionsError);
      return res.status(500).json({ error: '報酬データの取得に失敗しました' });
    }

    // データがない場合は空配列で処理続行
    const validCommissions = commissions || [];

    // 明細データ構築
    const items = validCommissions.map(commission => ({
      date: commission.sales ? new Date(commission.sales.sale_date).toLocaleDateString('ja-JP') : '-',
      saleNumber: commission.sales?.sale_number || '-',
      productName: commission.sales ? `Product ${commission.sales.product_id}` : '-',
      saleAmount: commission.sales?.total_amount || 0,
      baseCommission: commission.base_amount || 0,
      tierBonus: commission.tier_bonus || 0,
      campaignBonus: commission.campaign_bonus || 0,
      withholdingTax: commission.withholding_tax || 0,
      paymentAmount: commission.final_amount || 0,
      status: commission.status
    }));

    // 合計計算
    const totals = items.reduce((acc, item) => ({
      saleAmount: acc.saleAmount + item.saleAmount,
      baseCommission: acc.baseCommission + item.baseCommission,
      tierBonus: acc.tierBonus + item.tierBonus,
      campaignBonus: acc.campaignBonus + item.campaignBonus,
      withholdingTax: acc.withholdingTax + item.withholdingTax,
      paymentAmount: acc.paymentAmount + item.paymentAmount
    }), {
      saleAmount: 0,
      baseCommission: 0,
      tierBonus: 0,
      campaignBonus: 0,
      withholdingTax: 0,
      paymentAmount: 0
    });

    // 管理者向け月次集計データ
    const summaryData = {
      period: month,
      issueDate: new Date().toLocaleDateString('ja-JP'),
      agency: {
        company_name: agency.company_name,
        agency_code: agency.agency_code,
        tier_level: agency.tier_level,
        bank_account: agency.bank_account
      },
      items,
      totals,
      itemCount: items.length
    };

    // PDF生成
    const pdfBuffer = await generatePaymentStatementPDF(summaryData);

    // レスポンス
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="admin_monthly_summary_${month}_${agency.agency_code}.pdf"`
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('管理者向け月次集計明細書生成エラー:', error);
    res.status(500).json({ error: '管理者向け月次集計明細書の生成に失敗しました' });
  }
});

/**
 * 月単位領収書PDF生成
 * POST /api/invoices/receipt-monthly
 */
router.post('/receipt-monthly', authenticateToken, async (req, res) => {
  try {
    const { month, agency_id } = req.body;

    if (!month) {
      return res.status(400).json({ error: '対象月を指定してください' });
    }

    // 代理店IDを決定（管理者の場合はリクエストから、代理店ユーザーは自分の代理店）
    let agencyId;
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      // 管理者の場合はリクエストで指定された代理店ID
      agencyId = agency_id;
    } else {
      // 代理店ユーザーは自分の代理店のみ
      agencyId = req.user.agency?.id || req.user.agency_id;
    }

    if (!agencyId) {
      return res.status(400).json({ error: '代理店情報が見つかりません' });
    }

    // 代理店の報酬データ取得（支払済みのみ）
    const { data: commissions, error } = await supabase
      .from('commissions')
      .select(`
        *,
        agencies(
          company_name,
          agency_code
        )
      `)
      .eq('month', month)
      .eq('agency_id', agencyId)
      .eq('status', 'paid');

    if (error) {
      console.error('報酬データ取得エラー:', error);
      return res.status(500).json({ error: '報酬データの取得に失敗しました' });
    }

    if (!commissions || commissions.length === 0) {
      return res.status(404).json({ error: '該当月の支払済み報酬が見つかりません' });
    }

    // 月単位で合計した領収書データ構築
    const totalAmount = commissions.reduce((sum, comm) => sum + (comm.final_amount || 0), 0);
    const totalBase = commissions.reduce((sum, comm) => sum + (comm.base_amount || 0), 0);
    const totalTierBonus = commissions.reduce((sum, comm) => sum + (comm.tier_bonus || 0), 0);
    const totalWithholdingTax = commissions.reduce((sum, comm) => sum + (comm.withholding_tax || 0), 0);

    const receiptData = {
      receiptNumber: `RCP-M-${month.replace('-', '')}-${agencyId.substring(0, 8)}`,
      issueDate: new Date().toLocaleDateString('ja-JP'),
      agency: commissions[0].agencies,
      amount: totalAmount,
      description: `${month} 営業代理店報酬（月次合計）`,
      breakdown: [
        {
          label: '基本報酬合計',
          amount: totalBase
        },
        {
          label: '階層ボーナス合計',
          amount: totalTierBonus
        }
      ],
      invoiceRegistrationNumber: '1234567890123'
    };

    if (totalWithholdingTax > 0) {
      receiptData.breakdown.push({
        label: '源泉徴収税合計',
        amount: -totalWithholdingTax
      });
    }

    // PDF生成
    const pdfBuffer = await generateReceiptPDF(receiptData);

    // レスポンス
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt_monthly_${month}_${agencyId.substring(0, 8)}.pdf"`
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('月単位領収書生成エラー:', error);
    res.status(500).json({ error: '月単位領収書の生成に失敗しました' });
  }
});

/**
 * 管理者向け代理店一覧取得（月次集計用）
 * GET /api/invoices/agencies
 */
router.get('/agencies', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '管理者権限が必要です' });
    }

    const { data: agencies, error } = await supabase
      .from('agencies')
      .select('id, company_name, agency_code, tier_level, status')
      .eq('status', 'active')
      .order('agency_code', { ascending: true });

    if (error) {
      console.error('代理店一覧取得エラー:', error);
      return res.status(500).json({ error: '代理店一覧の取得に失敗しました' });
    }

    res.json(agencies || []);

  } catch (error) {
    console.error('代理店一覧取得エラー:', error);
    res.status(500).json({ error: '代理店一覧の取得に失敗しました' });
  }
});

/**
 * 請求書一覧取得
 * GET /api/invoices
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { month, status } = req.query;

    let query = supabase
      .from('commissions')
      .select(`
        id,
        month,
        base_amount,
        tier_bonus,
        campaign_bonus,
        withholding_tax,
        final_amount,
        status,
        created_at,
        agency_id,
        agencies(
          id,
          company_name,
          agency_code
        )
      `)
      .order('month', { ascending: false });

    // 管理者以外は自分の代理店のデータのみ
    if (req.user.role !== 'admin') {
      query = query.eq('agency_id', req.user.agency?.id);
    }

    if (month) {
      query = query.eq('month', month);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('請求書一覧取得エラー:', error);
      return res.status(500).json({ error: '請求書一覧の取得に失敗しました' });
    }

    // 請求書形式にデータを整形
    const invoices = data.map(commission => ({
      id: commission.id,
      invoiceNumber: `INV-${commission.month.replace('-', '')}-${commission.agency_id.substring(0,8)}`,
      month: commission.month,
      agencyName: commission.agencies.company_name,
      agencyCode: commission.agencies.agency_code,
      baseAmount: commission.base_amount,
      tierBonus: commission.tier_bonus,
      campaignBonus: commission.campaign_bonus || 0,
      amount: commission.final_amount,
      status: commission.status === 'paid' ? '支払済' :
              commission.status === 'approved' ? '承認済' :
              commission.status === 'carried_forward' ? '繰越' : '処理中',
      issueDate: commission.created_at,
      baseCommission: commission.base_amount,
      tierBonus: commission.tier_bonus,
      withholdingTax: commission.withholding_tax
    }));

    res.json(invoices);

  } catch (error) {
    console.error('請求書一覧取得エラー:', error);
    res.status(500).json({ error: '請求書一覧の取得に失敗しました' });
  }
});

module.exports = router;
