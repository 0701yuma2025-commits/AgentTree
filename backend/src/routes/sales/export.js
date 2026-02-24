/**
 * 売上エクスポート・サマリーAPI
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { getSubordinateAgencyIds } = require('../../utils/agencyHelpers');
const { Parser } = require('json2csv');

/**
 * GET /api/sales/export
 * 売上データをCSVでエクスポート
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, agency_id } = req.query;

    // 売上データを取得（外部結合なし）
    let query = supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false });

    // 期間フィルタ
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }

    // 代理店フィルタ（代理店ユーザーは自分のデータのみ、管理者は全データ）
    // 管理者以外の場合のみ代理店フィルタを適用
    if (req.user.role !== 'admin') {
      if (agency_id || req.user.agency?.id) {
        query = query.eq('agency_id', agency_id || req.user.agency?.id);
      }
    } else if (agency_id) {
      // 管理者が特定の代理店を指定した場合のみフィルタ
      query = query.eq('agency_id', agency_id);
    }

    const { data: sales, error } = await query;

    if (error) throw error;

    // 代理店情報を取得
    const agencyIds = [...new Set(sales.map(s => s.agency_id).filter(id => id))];
    const agencyMap = {};

    if (agencyIds.length > 0) {
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, company_name, agency_code')
        .in('id', agencyIds);

      if (agencies) {
        agencies.forEach(a => {
          agencyMap[a.id] = a;
        });
      }
    }

    // 商品情報を取得
    const productIds = [...new Set(sales.map(s => s.product_id).filter(id => id))];
    const productMap = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      if (products) {
        products.forEach(p => {
          productMap[p.id] = p;
        });
      }
    }

    // CSV用にデータを整形
    const csvData = sales.map(sale => ({
      売上番号: sale.sale_number,
      売上日: sale.sale_date,
      代理店コード: agencyMap[sale.agency_id]?.agency_code || '',
      代理店名: agencyMap[sale.agency_id]?.company_name || '',
      商品名: productMap[sale.product_id]?.name || '',
      数量: sale.quantity,
      売上金額: sale.total_amount,
      状態: sale.status === 'confirmed' ? '確定' : '仮登録'
    }));

    // CSVに変換
    const json2csvParser = new Parser({
      fields: ['売上番号', '売上日', '代理店コード', '代理店名', '商品名', '数量', '売上金額', '状態'],
      withBOM: true
    });
    const csv = json2csvParser.parse(csvData);

    // ファイル名を生成
    const filename = `sales_${new Date().toISOString().split('T')[0]}.csv`;

    // CSVをダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export sales error details:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    res.status(500).json({
      error: true,
      message: '売上データのエクスポートに失敗しました'
    });
  }
});

/**
 * GET /api/sales/summary
 * 売上サマリー取得
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['week', 'month', 'year'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ success: false, message: `periodが無効です。有効な値: ${validPeriods.join(', ')}` });
    }

    let startDate = new Date();
    if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    let query = supabase
      .from('sales')
      .select('total_amount, sale_date, status')
      .gte('sale_date', startDate.toISOString())
      .eq('status', 'confirmed');

    if (req.user.role === 'agency' && req.user.agency) {
      query = query.eq('agency_id', req.user.agency.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 集計
    const summary = {
      total_sales: data.reduce((sum, sale) => sum + sale.total_amount, 0),
      total_count: data.length,
      average_sale: data.length > 0 ? data.reduce((sum, sale) => sum + sale.total_amount, 0) / data.length : 0,
      period_start: startDate.toISOString(),
      period_end: new Date().toISOString()
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * GET /api/sales/organization-summary
 * 組織全体の売上サマリー取得（自社＋傘下）
 */
router.get('/organization-summary', authenticateToken, async (req, res) => {
  try {
    // 管理者は全体を見れる
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      // 全代理店の売上を取得
      const { data: allSales, error: salesError } = await supabase
        .from('sales')
        .select('*, agencies!inner(company_name, tier_level)')
        .eq('status', 'confirmed')
        .gte('sale_date', new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString());

      if (salesError) throw salesError;

      const totalAmount = allSales.reduce((sum, sale) => sum + sale.total_amount, 0);

      res.json({
        success: true,
        data: {
          total_amount: totalAmount,
          own_amount: 0,
          subordinate_amount: totalAmount,
          sale_count: allSales.length,
          top_agencies: [] // 管理者向けは後で実装
        }
      });
      return;
    }

    // 代理店ユーザーの場合
    if (!req.user.agency || !req.user.agency.id) {
      return res.status(400).json({
        error: true,
        message: '代理店情報が見つかりません'
      });
    }

    const agencyId = req.user.agency.id;

    // 1. 傘下の代理店IDを全て取得する再帰関数
    const getSubIds = async (parentId) => {
      const { data: children } = await supabase
        .from('agencies')
        .select('id')
        .eq('parent_agency_id', parentId);

      if (!children || children.length === 0) {
        return [];
      }

      let allIds = children.map(c => c.id);

      // 各子代理店の傘下も再帰的に取得
      for (const child of children) {
        const grandChildren = await getSubIds(child.id);
        allIds = allIds.concat(grandChildren);
      }

      return allIds;
    };

    // 傘下の代理店IDリストを取得
    const subordinateIds = await getSubIds(agencyId);
    const allAgencyIds = [agencyId, ...subordinateIds];

    // 2. 期間設定（直近30日）
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // 3. 売上データ取得
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('*, agencies!inner(id, company_name, tier_level)')
      .in('agency_id', allAgencyIds)
      .eq('status', 'confirmed')
      .gte('sale_date', startDate.toISOString())
      .order('sale_date', { ascending: false });

    if (salesError) throw salesError;

    // 4. 集計
    const ownSales = salesData.filter(s => s.agency_id === agencyId);
    const subordinateSales = salesData.filter(s => s.agency_id !== agencyId);

    const ownAmount = ownSales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const subordinateAmount = subordinateSales.reduce((sum, sale) => sum + sale.total_amount, 0);

    // 5. TOP代理店の計算（傘下のみ）
    const agencySalesMap = {};
    subordinateSales.forEach(sale => {
      if (!agencySalesMap[sale.agency_id]) {
        agencySalesMap[sale.agency_id] = {
          agency_id: sale.agency_id,
          agency_name: sale.agencies.company_name,
          total_amount: 0,
          sale_count: 0
        };
      }
      agencySalesMap[sale.agency_id].total_amount += sale.total_amount;
      agencySalesMap[sale.agency_id].sale_count += 1;
    });

    const topAgencies = Object.values(agencySalesMap)
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 5); // TOP5

    res.json({
      success: true,
      data: {
        total_amount: ownAmount + subordinateAmount,
        own_amount: ownAmount,
        subordinate_amount: subordinateAmount,
        sale_count: salesData.length,
        own_sale_count: ownSales.length,
        subordinate_sale_count: subordinateSales.length,
        top_agencies: topAgencies,
        period_start: startDate.toISOString(),
        period_end: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get organization summary error:', error);
    res.status(500).json({
      error: true,
      message: '組織売上サマリーの取得に失敗しました'
    });
  }
});

module.exports = router;
