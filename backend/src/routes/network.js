/**
 * ネットワーク可視化API
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { getSubordinateAgencyIds } = require('../utils/agencyHelpers');
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('network');

/**
 * GET /api/network/agencies
 * 代理店ネットワークデータ取得（3D可視化用）
 */
router.get('/agencies', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const userAgencyId = user.agency?.id;

    // 管理者は全代理店、代理店ユーザーは自分以下の階層のみ取得
    let agencies;

    if (isAdmin) {
      // 管理者：全代理店取得
      const { data, error } = await supabase
        .from('agencies')
        .select(`
          id,
          company_name,
          agency_code,
          tier_level,
          parent_agency_id,
          status
        `)
        .order('tier_level', { ascending: true });

      if (error) throw error;
      agencies = data;

    } else if (userAgencyId) {
      // 代理店ユーザー：共通ヘルパーでID一括取得 → データ取得
      const subordinateIds = await getSubordinateAgencyIds(userAgencyId);
      const { data, error: subError } = await supabase
        .from('agencies')
        .select('id, company_name, agency_code, tier_level, parent_agency_id, status')
        .in('id', subordinateIds)
        .order('tier_level', { ascending: true });

      if (subError) throw subError;
      agencies = data || [];

    } else {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    // 売上データを取得
    const agencyIds = agencies.map(a => a.id);
    const { data: salesData } = await supabase
      .from('sales')
      .select('agency_id, total_amount')
      .in('agency_id', agencyIds)
      .eq('status', 'confirmed');

    // 報酬データを取得
    const { data: commissionData } = await supabase
      .from('commissions')
      .select('agency_id, final_amount')
      .in('agency_id', agencyIds);

    // 売上・報酬を集計
    const salesByAgency = {};
    const commissionsByAgency = {};

    (salesData || []).forEach(sale => {
      salesByAgency[sale.agency_id] = (salesByAgency[sale.agency_id] || 0) + parseFloat(sale.total_amount);
    });

    (commissionData || []).forEach(comm => {
      commissionsByAgency[comm.agency_id] = (commissionsByAgency[comm.agency_id] || 0) + parseFloat(comm.final_amount);
    });

    // 3D Force Graph用のデータ形式に変換
    const nodes = agencies.map(agency => ({
      id: agency.id,
      name: agency.company_name,
      code: agency.agency_code,
      tier: agency.tier_level,
      parentId: agency.parent_agency_id,
      status: agency.status,
      sales: salesByAgency[agency.id] || 0,
      commission: commissionsByAgency[agency.id] || 0,
      // 下位代理店の数を計算
      childCount: agencies.filter(a => a.parent_agency_id === agency.id).length
    }));

    // リンク（親子関係）を作成
    // 親ノードがデータに存在する場合のみリンクを作成
    const agencyIdSet = new Set(agencies.map(a => a.id));
    const links = agencies
      .filter(agency => agency.parent_agency_id && agencyIdSet.has(agency.parent_agency_id))
      .map(agency => ({
        source: agency.parent_agency_id,
        target: agency.id
      }));

    res.json({
      success: true,
      data: {
        nodes,
        links
      }
    });

  } catch (error) {
    logger.error('Get network data error:', error.message);
    res.status(500).json({
      success: false,
      message: 'ネットワークデータの取得に失敗しました'
    });
  }
});

module.exports = router;
