/**
 * 売上管理API
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { getSubordinateAgencyIds } = require('../utils/agencyHelpers');
const { safeErrorMessage } = require('../utils/errorHelper');

// サブルーターをマウント
router.use('/', require('./sales/mutations'));
router.use('/', require('./sales/anomaly'));
router.use('/', require('./sales/export'));
router.use('/', require('./sales/history'));

/**
 * GET /api/sales
 * 売上一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, agency_id, status } = req.query;

    let query = supabase
      .from('sales')
      .select(`
        *,
        agencies!inner(company_name, tier_level)
      `)
      .order('sale_date', { ascending: false });

    // フィルター条件
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }
    if (agency_id) {
      query = query.eq('agency_id', agency_id);
    }
    if (status) {
      query = query.eq('status', status);
    }

    // 代理店ユーザーは自社と下位代理店の売上を表示
    if (req.user.role === 'agency' && req.user.agency) {
      const agencyIds = await getSubordinateAgencyIds(req.user.agency.id);
      query = query.in('agency_id', agencyIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 製品情報を別途取得してマージ
    if (data && data.length > 0) {
      const productIds = [...new Set(data.map(sale => sale.product_id).filter(id => id !== null))];

      const productMap = {};
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, price')
          .in('id', productIds);

        if (products) {
          products.forEach(p => productMap[p.id] = p);
        }
      }

      // 売上データに製品情報を追加し、代理店ユーザーの場合は下位代理店の顧客情報をマスキング
      const enrichedData = data.map(sale => {
        const saleData = {
          ...sale,
          product: productMap[sale.product_id] || { name: '不明', price: 0 }
        };

        // 代理店ユーザーで、自社以外の売上の場合は顧客情報をマスキング
        if (req.user.role === 'agency' && req.user.agency && sale.agency_id !== req.user.agency.id) {
          saleData.customer_name = '***';
          saleData.customer_email = '***';
          saleData.customer_phone = '***';
        }

        return saleData;
      });

      res.json({
        success: true,
        data: enrichedData
      });
    } else {
      res.json({
        success: true,
        data: []
      });
    }
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({
      success: false,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * GET /api/sales/:id
 * 売上詳細取得
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('sales')
      .select(`
        *,
        agency:agencies!inner(id, company_name, agency_code, tier_level)
      `)
      .eq('id', id);

    // 代理店ユーザーは自社と下位代理店の売上を表示
    if (req.user.role === 'agency' && req.user.agency) {
      const agencyIds = await getSubordinateAgencyIds(req.user.agency.id);
      query = query.in('agency_id', agencyIds);
    }

    // single()は最後に呼び出す
    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: '売上が見つかりません'
        });
      }
      throw error;
    }

    // 製品情報を別途取得してマージ
    if (data && data.product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('id', data.product_id)
        .single();

      if (product) {
        data.product = product;
      } else {
        data.product = { name: '不明', price: 0 };
      }
    }

    // 代理店ユーザーで、自社以外の売上の場合は顧客情報をマスキング
    if (req.user.role === 'agency' && req.user.agency && data.agency_id !== req.user.agency.id) {
      data.customer_name = '***';
      data.customer_email = '***';
      data.customer_phone = '***';
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Get sale detail error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: safeErrorMessage(error)
    });
  }
});

module.exports = router;
