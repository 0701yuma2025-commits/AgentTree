/**
 * ダッシュボードAPI
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/dashboard/stats
 * ダッシュボード統計情報取得
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = {};

    // 管理者の場合は全体の統計、代理店の場合は自社の統計
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const agencyId = req.user.agency?.id;

    // 1. 代理店数の取得
    if (isAdmin) {
      const { count: totalAgencies } = await supabase
        .from('agencies')
        .select('*', { count: 'exact', head: true });

      const { count: activeAgencies } = await supabase
        .from('agencies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      stats.agencies = {
        total: totalAgencies || 0,
        active: activeAgencies || 0,
        inactive: (totalAgencies || 0) - (activeAgencies || 0)
      };
    }

    // 2. 売上統計の取得
    let salesQuery = supabase
      .from('sales')
      .select('total_amount, sale_date, status, agency_id')
      .eq('status', 'confirmed');

    let agencyIds = null;
    if (!isAdmin && agencyId) {
      // 代理店の場合、自社と下位代理店の売上を含める
      const getSubordinateAgencyIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children && children.length > 0) {
          for (const child of children) {
            const childIds = await getSubordinateAgencyIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

      agencyIds = await getSubordinateAgencyIds(agencyId);
      salesQuery = salesQuery.in('agency_id', agencyIds);
    }

    const { data: salesData } = await salesQuery;

    // 今月の売上
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthSales = salesData?.filter(s => s.sale_date && s.sale_date.substring(0, 7) === currentMonth) || [];
    const lastMonthSales = salesData?.filter(s => s.sale_date.startsWith(lastMonthStr)) || [];

    const totalSalesAmount = salesData?.reduce((sum, s) => sum + parseFloat(s.total_amount), 0) || 0;
    const currentMonthAmount = currentMonthSales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0);
    const lastMonthAmount = lastMonthSales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0);

    // 成長率計算
    const growthRate = lastMonthAmount > 0
      ? ((currentMonthAmount - lastMonthAmount) / lastMonthAmount * 100).toFixed(1)
      : 0;

    stats.sales = {
      total: totalSalesAmount,
      currentMonth: currentMonthAmount,
      lastMonth: lastMonthAmount,
      growthRate: parseFloat(growthRate),
      count: salesData?.length || 0,
      currentMonthCount: currentMonthSales.length
    };

    // 3. 報酬統計の取得
    let commissionQuery = supabase
      .from('commissions')
      .select('final_amount, status, month');

    if (!isAdmin && agencyId) {
      commissionQuery = commissionQuery.eq('agency_id', agencyId);
    }

    const { data: commissionData } = await commissionQuery;

    const totalCommissions = commissionData?.reduce((sum, c) => sum + parseFloat(c.final_amount), 0) || 0;
    const pendingCommissions = commissionData?.filter(c => c.status === 'pending') || [];
    const approvedCommissions = commissionData?.filter(c => c.status === 'approved') || [];
    const paidCommissions = commissionData?.filter(c => c.status === 'paid') || [];

    const currentMonthCommissions = commissionData?.filter(c => c.month === currentMonth) || [];
    const currentMonthCommissionAmount = currentMonthCommissions.reduce((sum, c) => sum + parseFloat(c.final_amount), 0);

    stats.commissions = {
      total: totalCommissions,
      pending: pendingCommissions.reduce((sum, c) => sum + parseFloat(c.final_amount), 0),
      approved: approvedCommissions.reduce((sum, c) => sum + parseFloat(c.final_amount), 0),
      paid: paidCommissions.reduce((sum, c) => sum + parseFloat(c.final_amount), 0),
      currentMonth: currentMonthCommissionAmount,
      pendingCount: pendingCommissions.length,
      approvedCount: approvedCommissions.length,
      paidCount: paidCommissions.length
    };

    // 4. 最近の売上（5件）
    let recentSalesQuery = supabase
      .from('sales')
      .select(`
        *,
        agencies(company_name)
      `)
      .order('sale_date', { ascending: false })
      .limit(5);

    if (!isAdmin && agencyIds) {
      recentSalesQuery = recentSalesQuery.in('agency_id', agencyIds);
    }

    const { data: recentSales } = await recentSalesQuery;

    // 製品情報を取得してマージ
    if (recentSales && recentSales.length > 0) {
      const productIds = [...new Set(recentSales.map(s => s.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      const productMap = {};
      if (products) {
        products.forEach(p => productMap[p.id] = p);
      }

      stats.recentSales = recentSales.map(sale => ({
        sale_number: sale.sale_number,
        customer_name: sale.customer_name,
        product_name: productMap[sale.product_id]?.name || '不明',
        agency_name: sale.agencies?.company_name || '不明',
        total_amount: sale.total_amount,
        sale_date: sale.sale_date,
        status: sale.status
      }));
    } else {
      stats.recentSales = [];
    }

    // 5. 月別売上推移（過去6ヶ月）
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      const monthSales = salesData?.filter(s => s.sale_date.startsWith(monthStr)) || [];
      const monthAmount = monthSales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0);

      monthlyData.push({
        month: monthStr,
        sales: monthAmount,
        count: monthSales.length
      });
    }
    stats.monthlyTrend = monthlyData;

    // 6. 組織全体の売上サマリー（代理店のみ）
    if (!isAdmin && req.user.agency) {
      try {
        // 傘下の代理店IDを全て取得する再帰関数
        const getSubordinateAgencyIds = async (parentId) => {
          const { data: children } = await supabase
            .from('agencies')
            .select('id')
            .eq('parent_agency_id', parentId);

          if (!children || children.length === 0) {
            return [];
          }

          let allIds = children.map(c => c.id);
          for (const child of children) {
            const grandChildren = await getSubordinateAgencyIds(child.id);
            allIds = allIds.concat(grandChildren);
          }
          return allIds;
        };

        // 月別データ計算用の関数
        const calculateMonthlyOrgSales = (salesData, agencyId) => {
          const ownSales = salesData.filter(s => s.agency_id === agencyId);
          const subordinateSales = salesData.filter(s => s.agency_id !== agencyId);

          const ownAmount = ownSales.reduce((sum, sale) => sum + sale.total_amount, 0);
          const subordinateAmount = subordinateSales.reduce((sum, sale) => sum + sale.total_amount, 0);

          // TOP代理店の計算
          const agencySalesMap = {};
          subordinateSales.forEach(sale => {
            if (!agencySalesMap[sale.agency_id]) {
              agencySalesMap[sale.agency_id] = {
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
            .slice(0, 3); // TOP3

          return {
            total_amount: ownAmount + subordinateAmount,
            own_amount: ownAmount,
            subordinate_amount: subordinateAmount,
            sale_count: salesData.length,
            top_agencies: topAgencies
          };
        };

        const agencyId = req.user.agency.id;
        const subordinateIds = await getSubordinateAgencyIds(agencyId);
        const allAgencyIds = [agencyId, ...subordinateIds];

        // 今月のデータ取得
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const { data: currentSalesData } = await supabase
          .from('sales')
          .select('*, agencies!inner(id, company_name)')
          .in('agency_id', allAgencyIds)
          .eq('status', 'confirmed')
          .gte('sale_date', currentMonthStart.toISOString())
          .lt('sale_date', now.toISOString());

        // 先月のデータ取得
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        const { data: previousSalesData } = await supabase
          .from('sales')
          .select('*, agencies!inner(id, company_name)')
          .in('agency_id', allAgencyIds)
          .eq('status', 'confirmed')
          .gte('sale_date', previousMonthStart.toISOString())
          .lt('sale_date', previousMonthEnd.toISOString());

        stats.organizationSales = {
          current: currentSalesData ? calculateMonthlyOrgSales(currentSalesData, agencyId) : null,
          previous: previousSalesData ? calculateMonthlyOrgSales(previousSalesData, agencyId) : null
        };

      } catch (error) {
        console.error('Failed to fetch organization sales:', error);
        stats.organizationSales = null;
      }
    }

    // 7. 階層別代理店数（管理者のみ）
    if (isAdmin) {
      const { data: tierData } = await supabase
        .from('agencies')
        .select('tier_level, status');

      const tierStats = {
        tier1: { total: 0, active: 0 },
        tier2: { total: 0, active: 0 },
        tier3: { total: 0, active: 0 },
        tier4: { total: 0, active: 0 }
      };

      if (tierData) {
        tierData.forEach(agency => {
          const tierKey = `tier${agency.tier_level}`;
          if (tierStats[tierKey]) {
            tierStats[tierKey].total++;
            if (agency.status === 'active') {
              tierStats[tierKey].active++;
            }
          }
        });
      }

      stats.tierDistribution = tierStats;
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      error: true,
      message: 'ダッシュボードデータの取得に失敗しました'
    });
  }
});

/**
 * GET /api/dashboard/charts
 * グラフ用データ取得
 */
router.get('/charts', authenticateToken, async (req, res) => {
  try {
    const { period = '6months' } = req.query;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const agencyId = req.user.agency?.id;

    // 期間計算
    const now = new Date();
    let startDate;
    if (period === '3months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (period === '1year') {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    // 売上データ取得
    let salesQuery = supabase
      .from('sales')
      .select('total_amount, sale_date, agency_id')
      .gte('sale_date', startDate.toISOString().split('T')[0])
      .eq('status', 'confirmed');

    if (!isAdmin && agencyId) {
      // 代理店の場合、自社と下位代理店の売上を含める
      const getSubordinateAgencyIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children && children.length > 0) {
          for (const child of children) {
            const childIds = await getSubordinateAgencyIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

      const agencyIds = await getSubordinateAgencyIds(agencyId);
      salesQuery = salesQuery.in('agency_id', agencyIds);
    }

    const { data: salesData } = await salesQuery;

    // 報酬データ取得
    let commissionsQuery = supabase
      .from('commissions')
      .select('final_amount, month')
      .gte('month', `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`);

    if (!isAdmin && agencyId) {
      commissionsQuery = commissionsQuery.eq('agency_id', agencyId);
    }

    const { data: commissionsData } = await commissionsQuery;

    // 月別集計
    const chartData = {};
    let currentDate = new Date(startDate);
    while (currentDate <= now) {
      const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      const monthSales = salesData?.filter(s => s.sale_date.startsWith(monthStr)) || [];
      const monthCommissions = commissionsData?.filter(c => c.month === monthStr) || [];

      chartData[monthStr] = {
        sales: monthSales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0),
        commissions: monthCommissions.reduce((sum, c) => sum + parseFloat(c.final_amount), 0),
        count: monthSales.length
      };

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    res.json({
      success: true,
      data: chartData
    });

  } catch (error) {
    console.error('Get chart data error:', error);
    res.status(500).json({
      error: true,
      message: 'グラフデータの取得に失敗しました'
    });
  }
});

module.exports = router;