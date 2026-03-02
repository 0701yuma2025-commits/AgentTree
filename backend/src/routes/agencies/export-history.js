/**
 * 代理店エクスポート・履歴API
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { Parser } = require('json2csv');
const { sanitizeCsvRow } = require('../../utils/csvSanitizer');

/**
 * GET /api/agencies/export
 * 代理店データCSVエクスポート
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { tier, status } = req.query;

    let query = supabase
      .from('agencies')
      .select(`
        *,
        parent_agencies:parent_agency_id (
          company_name,
          agency_code
        )
      `)
      .order('tier_level', { ascending: true })
      .order('created_at', { ascending: false });

    // フィルター
    if (tier) {
      query = query.eq('tier_level', parseInt(tier));
    }
    if (status) {
      query = query.eq('status', status);
    }

    // 代理店ユーザーの場合は自分と傘下のみ
    if (req.user.role === 'agency' && req.user.agency_id) {
      // 傘下の代理店IDを再帰的に取得
      const getSubordinateIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children) {
          for (const child of children) {
            const childIds = await getSubordinateIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

      const subordinateIds = await getSubordinateIds(req.user.agency_id);
      query = query.in('id', subordinateIds);
    }

    const { data: agencies, error } = await query;

    if (error) throw error;

    // CSV用にデータを整形
    const csvData = agencies.map(agency => sanitizeCsvRow({
      代理店コード: agency.agency_code,
      会社名: agency.company_name,
      階層: `Tier ${agency.tier_level}`,
      親代理店コード: agency.parent_agencies?.agency_code || '',
      親代理店名: agency.parent_agencies?.company_name || '',
      代表者名: agency.representative_name,
      メールアドレス: agency.contact_email,
      電話番号: agency.contact_phone,
      郵便番号: agency.postal_code,
      住所: agency.address,
      銀行口座: agency.bank_name ? `${agency.bank_name} ${agency.branch_name} ${agency.account_type} ${agency.account_number}` : '',
      状態: agency.status === 'active' ? '有効' :
           agency.status === 'pending' ? '承認待ち' :
           agency.status === 'suspended' ? '停止中' :
           agency.status === 'rejected' ? '却下' : agency.status,
      登録日: agency.created_at
    }));

    // CSVに変換
    const json2csvParser = new Parser({
      fields: ['代理店コード', '会社名', '階層', '親代理店コード', '親代理店名',
               '代表者名', 'メールアドレス', '電話番号', '郵便番号', '住所',
               '銀行口座', '状態', '登録日'],
      withBOM: true
    });
    const csv = json2csvParser.parse(csvData);

    // ファイル名を生成
    const filename = `agencies_${new Date().toISOString().split('T')[0]}.csv`;

    // CSVをダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export agencies error:', error);
    res.status(500).json({
      success: false,
      message: '代理店データのエクスポートに失敗しました'
    });
  }
});

/**
 * GET /api/agencies/:id/history
 * 代理店の登録履歴取得
 */
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.params.id;

    // UUID形式チェック
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agencyId)) {
      return res.status(400).json({
        success: false,
        message: '無効なIDです'
      });
    }

    // 権限チェック
    let hasAccess = false;

    // 管理者は全て見れる
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      hasAccess = true;
    }
    // 自分の代理店
    else if (req.user.agency && req.user.agency.id === agencyId) {
      hasAccess = true;
    }
    // 傘下の代理店かチェック
    else if (req.user.agency && req.user.agency.id) {
      // 対象代理店の親チェーンを辿って、自分が親に含まれるか確認
      const { data: targetAgency } = await supabase
        .from('agencies')
        .select('parent_agency_id')
        .eq('id', agencyId)
        .single();

      if (targetAgency) {
        let currentParentId = targetAgency.parent_agency_id;
        while (currentParentId) {
          if (currentParentId === req.user.agency.id) {
            hasAccess = true;
            break;
          }
          const { data: parentAgency } = await supabase
            .from('agencies')
            .select('parent_agency_id')
            .eq('id', currentParentId)
            .single();

          currentParentId = parentAgency?.parent_agency_id;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'この代理店の履歴を閲覧する権限がありません'
      });
    }

    // invitationsテーブルから関連する招待履歴を取得
    // inviter_agency_id: 招待者の代理店ID（この代理店が送信した招待）
    // created_agency_id: 受諾済み招待で作成された代理店ID（この代理店として登録された招待）
    // 2つのクエリで招待履歴を取得（.or()の文字列補間を回避）
    const [{ data: sentInvitations }, { data: receivedInvitations }] = await Promise.all([
      supabase.from('invitations').select('*').eq('inviter_agency_id', agencyId).order('created_at', { ascending: false }),
      supabase.from('invitations').select('*').eq('created_agency_id', agencyId).order('created_at', { ascending: false })
    ]);

    // 重複排除してマージ
    const invitationMap = new Map();
    [...(sentInvitations || []), ...(receivedInvitations || [])].forEach(inv => {
      invitationMap.set(inv.id, inv);
    });
    const invitations = [...invitationMap.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const invitationError = null;

    if (invitationError) {
      console.error('Invitation history fetch error:', invitationError);
      return res.status(500).json({
        success: false,
        message: '招待履歴の取得に失敗しました'
      });
    }

    // 代理店の基本登録情報
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', agencyId)
      .single();

    if (agencyError) {
      return res.status(404).json({
        success: false,
        message: '代理店が見つかりません'
      });
    }

    // 履歴データを統合・整形
    const history = [];

    // 代理店登録情報を履歴に追加
    history.push({
      type: 'registration',
      date: agencyData.created_at,
      status: agencyData.status,
      description: `代理店登録 (${agencyData.company_name})`,
      details: {
        company_name: agencyData.company_name,
        tier_level: agencyData.tier_level,
        status: agencyData.status
      }
    });

    // 招待履歴を追加
    invitations.forEach(invitation => {
      // invitationsテーブルの実際のカラムに合わせて修正
      const status = invitation.accepted_at ? '受諾済み' : '送信済み';
      const isAccepted = !!invitation.accepted_at;

      history.push({
        type: 'invitation',
        date: invitation.created_at,
        status: status,
        description: `招待${isAccepted ? '受諾' : '送信'} - ${invitation.email}`,
        details: {
          email: invitation.email,
          tier_level: invitation.tier_level,
          token: invitation.token,
          expires_at: invitation.expires_at,
          accepted_at: invitation.accepted_at,
          created_agency_id: invitation.created_agency_id
        }
      });
    });

    // 時系列順にソート
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Agency history fetch error:', error);
    res.status(500).json({
      success: false,
      message: '履歴の取得に失敗しました'
    });
  }
});

module.exports = router;
