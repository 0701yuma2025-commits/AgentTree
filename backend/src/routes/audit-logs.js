/**
 * 監査ログAPI
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/audit-logs
 * 監査ログ一覧取得（管理者のみ）
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 管理者のみアクセス可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        error: true,
        message: '権限がありません'
      });
    }

    // クエリパラメータ（バリデーション付き）
    const {
      user_id,
      action,
      resource_type,
      status,
      start_date,
      end_date,
      search
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // クエリ構築
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    // フィルター適用
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    if (action) {
      query = query.eq('action', action);
    }

    if (resource_type) {
      query = query.eq('resource_type', resource_type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (start_date) {
      query = query.gte('timestamp', start_date);
    }

    if (end_date) {
      query = query.lte('timestamp', end_date);
    }

    // 検索（ユーザーメール、説明文）— 特殊文字をエスケープ
    if (search) {
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      query = query.or(`user_email.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`);
    }

    // ソート・ページネーション
    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get audit logs error:', error.message);
    res.status(500).json({
      error: true,
      message: '監査ログの取得に失敗しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/audit-logs/:id
 * 監査ログ詳細取得（管理者のみ）
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 管理者のみアクセス可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        error: true,
        message: '権限がありません'
      });
    }

    const { id } = req.params;

    const { data: log, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!log) {
      return res.status(404).json({
        error: true,
        message: '監査ログが見つかりません'
      });
    }

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    console.error('Get audit log detail error:', error);
    res.status(500).json({
      error: true,
      message: '監査ログの取得に失敗しました'
    });
  }
});

/**
 * GET /api/audit-logs/stats/summary
 * 監査ログ統計情報（管理者のみ）
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 管理者のみアクセス可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        error: true,
        message: '権限がありません'
      });
    }

    const { start_date, end_date } = req.query;

    // 期間内の総ログ数
    let totalQuery = supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true });

    if (start_date) totalQuery = totalQuery.gte('timestamp', start_date);
    if (end_date) totalQuery = totalQuery.lte('timestamp', end_date);

    const { count: totalLogs } = await totalQuery;

    // アクション別集計
    let actionQuery = supabase
      .from('audit_logs')
      .select('action');

    if (start_date) actionQuery = actionQuery.gte('timestamp', start_date);
    if (end_date) actionQuery = actionQuery.lte('timestamp', end_date);

    const { data: actionData } = await actionQuery;

    const actionStats = actionData.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    // リソース別集計
    let resourceQuery = supabase
      .from('audit_logs')
      .select('resource_type');

    if (start_date) resourceQuery = resourceQuery.gte('timestamp', start_date);
    if (end_date) resourceQuery = resourceQuery.lte('timestamp', end_date);

    const { data: resourceData } = await resourceQuery;

    const resourceStats = resourceData.reduce((acc, log) => {
      acc[log.resource_type] = (acc[log.resource_type] || 0) + 1;
      return acc;
    }, {});

    // 失敗ログ数
    let failureQuery = supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failure');

    if (start_date) failureQuery = failureQuery.gte('timestamp', start_date);
    if (end_date) failureQuery = failureQuery.lte('timestamp', end_date);

    const { count: failureLogs } = await failureQuery;

    res.json({
      success: true,
      data: {
        totalLogs,
        failureLogs,
        successRate: totalLogs > 0 ? ((totalLogs - failureLogs) / totalLogs * 100).toFixed(2) : 100,
        actionStats,
        resourceStats
      }
    });

  } catch (error) {
    console.error('Get audit log stats error:', error);
    res.status(500).json({
      error: true,
      message: '統計情報の取得に失敗しました'
    });
  }
});

/**
 * GET /api/audit-logs/export/csv
 * 監査ログCSVエクスポート（管理者のみ）
 */
router.get('/export/csv', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // 管理者のみアクセス可能
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        error: true,
        message: '権限がありません'
      });
    }

    const {
      user_id,
      action,
      resource_type,
      status,
      start_date,
      end_date
    } = req.query;

    // クエリ構築
    let query = supabase
      .from('audit_logs')
      .select('*');

    if (user_id) query = query.eq('user_id', user_id);
    if (action) query = query.eq('action', action);
    if (resource_type) query = query.eq('resource_type', resource_type);
    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('timestamp', start_date);
    if (end_date) query = query.lte('timestamp', end_date);

    query = query.order('timestamp', { ascending: false }).limit(10000);

    const { data: logs, error } = await query;

    if (error) throw error;

    // CSV生成
    const csvHeader = 'Timestamp,User Email,Action,Resource Type,Resource ID,Description,Status,IP Address\n';
    const csvRows = logs.map(log => {
      return `${log.timestamp},"${log.user_email}",${log.action},${log.resource_type},${log.resource_id || ''},"${log.description}",${log.status},${log.ip_address}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv);  // BOM for Excel

  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      error: true,
      message: 'エクスポートに失敗しました'
    });
  }
});

module.exports = router;
