/**
 * 売上変更履歴API
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { getSubordinateAgencyIds } = require('../../utils/agencyHelpers');

/**
 * GET /api/sales/:id/history
 * 売上の変更履歴取得
 */
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 売上情報を取得して権限チェック
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('agency_id')
      .eq('id', id)
      .single();

    if (saleError || !sale) {
      return res.status(404).json({
        success: false,
        message: '売上情報が見つかりません'
      });
    }

    // 代理店ユーザーは自社または下位代理店の売上のみ閲覧可能
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && req.user.role === 'agency') {
      const allowedAgencyIds = await getSubordinateAgencyIds(req.user.agency.id);
      if (!allowedAgencyIds.includes(sale.agency_id)) {
        return res.status(403).json({
          success: false,
          message: '変更履歴を閲覧する権限がありません'
        });
      }
    }

    // 変更履歴を取得
    const { data: history, error: historyError } = await supabase
      .from('sale_change_history')
      .select(`
        *,
        users!inner(full_name, email)
      `)
      .eq('sale_id', id)
      .order('changed_at', { ascending: false });

    if (historyError) throw historyError;

    // ユーザー情報を整形
    const formattedHistory = history.map(item => ({
      id: item.id,
      field_name: item.field_name,
      old_value: item.old_value,
      new_value: item.new_value,
      changed_at: item.changed_at,
      changed_by: {
        id: item.changed_by,
        name: item.users?.full_name || '不明',
        email: item.users?.email || ''
      }
    }));

    res.json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    console.error('Get sale history error:', error);
    res.status(500).json({
      success: false,
      message: '変更履歴の取得に失敗しました'
    });
  }
});

module.exports = router;
