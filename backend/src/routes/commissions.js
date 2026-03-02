/**
 * 報酬管理API
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { calculateMonthlyCommissions } = require('../utils/calculateCommission');
const { sanitizeCsvRow } = require('../utils/csvSanitizer');
const { Parser } = require('json2csv');

// 月パラメータ(YYYY-MM)のバリデーション
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const isValidMonth = (month) => MONTH_REGEX.test(month);

// エクスポート用レート制限（1分あたり5回まで）
const exportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'エクスポートのリクエスト回数が上限を超えました。1分後に再試行してください。' }
});

/**
 * GET /api/commissions
 * 報酬一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { month, status, agency_id } = req.query;

    // monthパラメータのバリデーション
    if (month && !isValidMonth(month)) {
      return res.status(400).json({ success: false, message: 'month形式が無効です（YYYY-MM）' });
    }

    let query = supabase
      .from('commissions')
      .select(`
        *,
        agencies!inner(company_name, tier_level)
      `)
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });

    // フィルター
    if (month) {
      query = query.eq('month', month);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (agency_id) {
      query = query.eq('agency_id', agency_id);
    }

    // 代理店ユーザーは自社の報酬のみ
    if (req.user.role === 'agency' && req.user.agency) {
      query = query.eq('agency_id', req.user.agency.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 売上情報を一括取得（N+1クエリ防止）
    if (data && data.length > 0) {
      // 1. sale_idがあるレコード → 一括取得
      const saleIds = [...new Set(data.filter(c => c.sale_id).map(c => c.sale_id))];
      const saleMap = {};

      if (saleIds.length > 0) {
        const { data: salesBatch } = await supabase
          .from('sales')
          .select('id, sale_number, total_amount, sale_date')
          .in('id', saleIds);

        if (salesBatch) {
          salesBatch.forEach(sale => { saleMap[sale.id] = sale; });
        }
      }

      // 2. sale_idがないレコード（旧データ）→ 月別に一括取得
      const commissionsWithoutSaleId = data.filter(c => !c.sale_id);
      const months = [...new Set(commissionsWithoutSaleId.map(c => c.month))];
      const monthlySalesCache = {};

      for (const m of months) {
        const [y, mn] = m.split('-').map(Number);
        const lastDay = new Date(y, mn, 0).getDate();
        const { data: monthSales } = await supabase
          .from('sales')
          .select('id, sale_number, total_amount, sale_date, agency_id')
          .eq('status', 'confirmed')
          .gte('sale_date', `${m}-01`)
          .lte('sale_date', `${m}-${String(lastDay).padStart(2, '0')}`)
          .order('sale_date', { ascending: true });

        monthlySalesCache[m] = monthSales || [];
      }

      // 3. 各レコードに売上を紐付け
      for (const commission of data) {
        if (commission.sale_id && saleMap[commission.sale_id]) {
          commission.sales = saleMap[commission.sale_id];
        } else if (!commission.sale_id && commission.month) {
          const monthSales = monthlySalesCache[commission.month] || [];
          // 同じ代理店の売上を検索
          let matched = monthSales.find(s => s.agency_id === commission.agency_id);
          // 階層ボーナスの場合は月の最初の売上を代表として使用
          if (!matched && commission.base_amount === 0 && commission.tier_bonus > 0) {
            matched = monthSales[0] || null;
          }
          if (matched) {
            commission.sales = matched;
          }
        }
      }
    }

    // 売上IDでグループ化してから売上日時でソート
    if (data && data.length > 0) {
      data.sort((a, b) => {
        // 売上IDまたは売上番号でグループ化
        const aSaleId = a.sale_id || a.sales?.id;
        const bSaleId = b.sale_id || b.sales?.id;

        if (aSaleId && bSaleId) {
          // 同じ売上IDの場合
          if (aSaleId === bSaleId) {
            // 基本報酬を先に、階層ボーナスを後に
            if (a.base_amount > 0 && b.base_amount === 0) return -1;
            if (a.base_amount === 0 && b.base_amount > 0) return 1;
            // その後は代理店IDでソート
            return a.agency_id.localeCompare(b.agency_id);
          }

          // 異なる売上の場合は売上日でソート（新しい順）
          if (a.sales?.sale_date && b.sales?.sale_date) {
            const dateCompare = new Date(b.sales.sale_date) - new Date(a.sales.sale_date);
            if (dateCompare !== 0) return dateCompare;
            // 同じ日付の場合は売上番号でソート（番号が大きい方が新しい）
            return (b.sales?.sale_number || '').localeCompare(a.sales?.sale_number || '');
          }
        }

        // 片方のみ売上データがある場合
        if (aSaleId && !bSaleId) return -1;
        if (!aSaleId && bSaleId) return 1;

        // どちらも売上データがない場合は月とcreated_atでソート
        const monthCompare = b.month.localeCompare(a.month);
        if (monthCompare !== 0) return monthCompare;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({
      success: false,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * GET /api/commissions/summary
 * 報酬サマリー取得
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    // クエリパラメータから月を取得、なければ現在月を使用
    if (req.query.month && !isValidMonth(req.query.month)) {
      return res.status(400).json({ success: false, message: 'month形式が無効です（YYYY-MM）' });
    }
    const targetMonth = req.query.month || new Date().toISOString().slice(0, 7);
    let query = supabase
      .from('commissions')
      .select('base_amount, tier_bonus, campaign_bonus, final_amount, status')
      .eq('month', targetMonth);

    if (req.user.role === 'agency' && req.user.agency) {
      query = query.eq('agency_id', req.user.agency.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    const summary = {
      month: targetMonth,
      total_base: data.reduce((sum, c) => sum + (c.base_amount || 0), 0),
      total_tier_bonus: data.reduce((sum, c) => sum + (c.tier_bonus || 0), 0),
      total_campaign_bonus: data.reduce((sum, c) => sum + (c.campaign_bonus || 0), 0),
      total_final: data.reduce((sum, c) => sum + (c.final_amount || 0), 0),
      pending_count: data.filter(c => c.status === 'pending').length,
      confirmed_count: data.filter(c => c.status === 'confirmed').length,
      approved_count: data.filter(c => c.status === 'approved').length,
      paid_count: data.filter(c => c.status === 'paid').length
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get commission summary error:', error);
    res.status(500).json({
      success: false,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * POST /api/commissions/calculate
 * 報酬計算実行（管理者のみ）
 */
router.post('/calculate',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { month = new Date().toISOString().slice(0, 7) } = req.body;

      if (!isValidMonth(month)) {
        return res.status(400).json({ success: false, message: 'month形式が無効です（YYYY-MM）' });
      }

      // 月末日を正しく計算
      const [year, monthNum] = month.split('-').map(Number);
      const lastDay = new Date(year, monthNum, 0).getDate(); // 月末日を取得
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

      // 1. 対象月の売上データを取得
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('status', 'confirmed')
        .gte('sale_date', monthStart)
        .lte('sale_date', monthEnd);

      if (salesError) throw salesError;

      if (!sales || sales.length === 0) {
        return res.json({
          success: true,
          message: '対象月の売上データがありません',
          data: []
        });
      }

      // 2. 全代理店データを取得
      const { data: agencies, error: agenciesError } = await supabase
        .from('agencies')
        .select('*')
        .eq('status', 'active');

      if (agenciesError) throw agenciesError;

      // 3. 商品データを取得
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);

      if (productsError) throw productsError;

      // 4. 既存の報酬レコードから各売上の登録時設定値を取得
      const { data: existingCommissions, error: existingError } = await supabase
        .from('commissions')
        .select('sale_id, calculation_details')
        .eq('month', month);

      // 売上IDごとの設定値マップを作成
      const saleSettingsMap = {};
      if (existingCommissions) {
        existingCommissions.forEach(comm => {
          if (comm.calculation_details?.applied_settings) {
            saleSettingsMap[comm.sale_id] = comm.calculation_details.applied_settings;
          }
        });
      }

      // デフォルト設定値（設定値が保存されていない古いデータ用）
      const defaultSettings = {
        tier1_from_tier2_bonus: 2.00,
        tier2_from_tier3_bonus: 1.50,
        tier3_from_tier4_bonus: 1.00,
        minimum_payment_amount: 10000,
        withholding_tax_rate: 10.21,
        non_invoice_deduction_rate: 2.00
      };

      // 5. 売上ごとに個別に報酬を計算（各売上の登録時設定値を使用）
      // 売上ごとに登録時の設定値を埋め込む
      const salesWithSettings = sales.map(sale => ({
        ...sale,
        _applied_settings: saleSettingsMap[sale.id] || defaultSettings
      }));

      const commissions = calculateMonthlyCommissions(salesWithSettings, agencies, products, month, null);

      // DBに挿入するデータを準備（不要なフィールドを削除）
      const commissionsForDB = commissions.map(commission => ({
        agency_id: commission.agency_id,
        sale_id: commission.sale_id,  // 売上との紐付けを保持
        month: commission.month,
        base_amount: commission.base_amount,
        tier_bonus: commission.tier_bonus,
        campaign_bonus: commission.campaign_bonus,
        // invoice_deductionカラムは存在しないため削除
        final_amount: commission.final_amount,
        status: commission.status || 'confirmed',  // 計算時のステータスを保持（デフォルトは確定）
        tier_level: commission.tier_level,
        withholding_tax: commission.withholding_tax || 0,
        carry_forward_reason: commission.carry_forward_reason || null
      }));

      // 既存の同月報酬データをバックアップしてから置換（擬似トランザクション）
      const { data: existingData } = await supabase
        .from('commissions')
        .select('*')
        .eq('month', month);

      const { error: deleteError } = await supabase
        .from('commissions')
        .delete()
        .eq('month', month);

      if (deleteError) throw deleteError;

      // 新しい報酬データを挿入
      const { data: insertedData, error: insertError } = await supabase
        .from('commissions')
        .insert(commissionsForDB)
        .select();

      if (insertError) {
        // INSERT失敗時：バックアップデータで復元を試みる
        if (existingData && existingData.length > 0) {
          const rollbackData = existingData.map(({ id, created_at, updated_at, ...rest }) => rest);
          await supabase.from('commissions').insert(rollbackData).catch(rollbackErr => {
            console.error('Rollback failed:', rollbackErr);
          });
        }
        throw insertError;
      }

      res.json({
        success: true,
        message: `${month}の報酬計算が完了しました`,
        data: {
          month: month,
          total_commissions: commissions.length,
          total_amount: commissions.reduce((sum, c) => sum + c.final_amount, 0),
          details: insertedData
        }
      });
    } catch (error) {
      console.error('Calculate commissions error:', error);
      res.status(500).json({
        success: false,
        message: '報酬計算に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/commissions/:id/confirm
 * 報酬確定（管理者のみ）
 */
router.put('/:id/confirm',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: req.user.id
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Confirm commission error:', error);
      res.status(500).json({
        success: false,
        message: '報酬確定に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/commissions/:id/approve
 * 報酬承認（管理者のみ）
 */
router.put('/:id/approve',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: req.user.id
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data,
        message: '報酬を承認しました'
      });
    } catch (error) {
      console.error('Approve commission error:', error);
      res.status(500).json({
        success: false,
        message: '報酬承認に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/commissions/:id/pay
 * 報酬支払済み（管理者のみ）
 */
router.put('/:id/pay',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { payment_date, payment_method, transaction_id } = req.body;

      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          paid_at: payment_date || new Date().toISOString(),
          payment_method: payment_method || 'bank_transfer',
          transaction_id: transaction_id || null,
          paid_by: req.user.id
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data,
        message: '報酬を支払済みに更新しました'
      });
    } catch (error) {
      console.error('Pay commission error:', error);
      res.status(500).json({
        success: false,
        message: '支払い状態の更新に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/commissions/:id/status
 * 報酬ステータス更新（管理者のみ）
 */
router.put('/:id/status',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['pending', 'confirmed', 'approved', 'paid', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: '無効なステータスです'
        });
      }

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      // ステータスに応じて追加フィールドを設定
      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
        updateData.paid_by = req.user.id;
      } else if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = req.user.id;
      } else if (status === 'confirmed') {
        updateData.confirmed_at = new Date().toISOString();
        updateData.confirmed_by = req.user.id;
      }

      if (notes) {
        updateData.notes = notes;
      }

      const { data, error } = await supabase
        .from('commissions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data,
        message: 'ステータスを更新しました'
      });
    } catch (error) {
      console.error('Update commission status error:', error);
      res.status(500).json({
        success: false,
        message: 'ステータスの更新に失敗しました'
      });
    }
  }
);

/**
 * GET /api/commissions/export
 * 報酬データCSVエクスポート
 */
router.get('/export', authenticateToken, exportRateLimit, async (req, res) => {
  try {
    const { month, status, agency_id } = req.query;

    if (month && !isValidMonth(month)) {
      return res.status(400).json({ success: false, message: 'month形式が無効です（YYYY-MM）' });
    }

    let query = supabase
      .from('commissions')
      .select(`
        *,
        agencies!inner(company_name, agency_code, tier_level)
      `)
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });

    // フィルター
    if (month) {
      query = query.eq('month', month);
    }
    if (status) {
      query = query.eq('status', status);
    }
    // 代理店フィルタ（代理店ユーザーは自分のデータのみ、管理者は全データ）
    if (req.user.role !== 'admin') {
      if (agency_id || req.user.agency_id) {
        query = query.eq('agency_id', agency_id || req.user.agency_id);
      }
    } else if (agency_id) {
      // 管理者が特定の代理店を指定した場合のみフィルタ
      query = query.eq('agency_id', agency_id);
    }

    const { data: commissions, error } = await query;

    if (error) throw error;

    // CSV用にデータを整形（数式インジェクション対策済み）
    const csvData = commissions.map(commission => sanitizeCsvRow({
      対象月: commission.month,
      代理店コード: commission.agencies?.agency_code || '',
      代理店名: commission.agencies?.company_name || '',
      階層: `Tier ${commission.agencies?.tier_level}`,
      売上金額: commission.sales_amount,
      基本報酬: commission.base_commission,
      階層ボーナス: commission.tier_bonus || 0,
      キャンペーンボーナス: commission.campaign_bonus || 0,
      合計報酬: commission.total_commission,
      状態: commission.status === 'confirmed' ? '確定' :
            commission.status === 'paid' ? '支払済' : '計算済',
      計算日: commission.created_at
    }));

    // CSVに変換
    const json2csvParser = new Parser({
      fields: ['対象月', '代理店コード', '代理店名', '階層', '売上金額',
               '基本報酬', '階層ボーナス', 'キャンペーンボーナス', '合計報酬', '状態', '計算日'],
      withBOM: true
    });
    const csv = json2csvParser.parse(csvData);

    // ファイル名を生成
    const safeMonth = (month || new Date().toISOString().split('T')[0]).replace(/[^0-9-]/g, '');
    const filename = `commissions_${safeMonth}.csv`;

    // CSVをダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export commissions error:', error);
    res.status(500).json({
      success: false,
      message: '報酬データのエクスポートに失敗しました'
    });
  }
});

module.exports = router;