/**
 * キャンペーン管理API
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/errorHelper');

/**
 * GET /api/campaigns
 * キャンペーン一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { active_only, include_expired } = req.query;
    const now = new Date().toISOString();

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    // アクティブなキャンペーンのみ
    if (active_only === 'true') {
      query = query
        .lte('start_date', now)
        .gte('end_date', now)
        .eq('is_active', true);
    }

    // 期限切れを除外
    if (include_expired !== 'true') {
      query = query.gte('end_date', now);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 各キャンペーンの状態を計算とデータ形式の変換
    const campaignsWithStatus = data?.map(campaign => ({
      ...campaign,
      bonus_type: campaign.conditions?.bonus_type ||
                  (campaign.bonus_rate !== null ? 'percentage' : 'fixed'),
      bonus_value: campaign.bonus_rate !== null ? campaign.bonus_rate : campaign.bonus_amount,
      target_products: campaign.conditions?.target_products || null,
      target_agencies: campaign.conditions?.target_agencies || null,
      target_tiers: campaign.target_tier_levels || [1, 2, 3, 4],
      status: getCampaignStatus(campaign)
    })) || [];

    res.json({
      success: true,
      data: campaignsWithStatus
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/campaigns/active
 * 現在有効なキャンペーン取得（売上計算用）
 */
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString();

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .lte('start_date', targetDate)
      .gte('end_date', targetDate)
      .eq('is_active', true);

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get active campaigns error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * GET /api/campaigns/:id
 * キャンペーン詳細取得
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'キャンペーンが見つかりません'
      });
    }

    // キャンペーンの実績を取得
    const stats = await getCampaignStats(id);

    // データ形式の変換
    const campaignData = {
      ...data,
      bonus_type: data.conditions?.bonus_type ||
                  (data.bonus_rate !== null ? 'percentage' : 'fixed'),
      bonus_value: data.bonus_rate !== null ? data.bonus_rate : data.bonus_amount,
      target_products: data.conditions?.target_products || null,
      target_agencies: data.conditions?.target_agencies || null,
      target_tiers: data.target_tier_levels || [1, 2, 3, 4],
      status: getCampaignStatus(data),
      stats
    };

    res.json({
      success: true,
      data: campaignData
    });
  } catch (error) {
    console.error('Get campaign detail error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * POST /api/campaigns
 * キャンペーン作成（管理者のみ）
 */
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('name').notEmpty().withMessage('キャンペーン名は必須です'),
    body('start_date').isISO8601().withMessage('開始日が不正です'),
    body('end_date').isISO8601().withMessage('終了日が不正です'),
    body('bonus_type').isIn(['percentage', 'fixed']).withMessage('ボーナスタイプが不正です'),
    body('bonus_value').isNumeric().withMessage('ボーナス値は数値で入力してください')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg
        });
      }

      const {
        name,
        description,
        start_date,
        end_date,
        bonus_type,
        bonus_value,
        target_products,
        target_tiers,
        target_agencies,
        conditions,
        max_bonus_per_agency
      } = req.body;

      // 期間の妥当性チェック
      if (new Date(end_date) <= new Date(start_date)) {
        return res.status(400).json({
          success: false,
          message: '終了日は開始日より後に設定してください'
        });
      }

      // データベーススキーマに合わせてデータを変換
      const campaignData = {
        name,
        description: description || null,
        start_date,
        end_date,
        bonus_rate: bonus_type === 'percentage' ? bonus_value : null,
        bonus_amount: bonus_type === 'fixed' ? bonus_value : null,
        target_tier_levels: target_tiers || [1, 2, 3, 4], // デフォルトは全Tier
        conditions: {
          ...(conditions || {}),
          bonus_type: bonus_type, // conditionsに型を保存
          target_products: target_products || null,
          target_agencies: target_agencies || null,
          max_bonus_per_agency: max_bonus_per_agency || null
        },
        is_active: true
      };

      // キャンペーン作成
      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaignData)
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'キャンペーンを作成しました',
        data
      });
    } catch (error) {
      console.error('Create campaign error:', error);
      res.status(500).json({
        success: false,
        message: safeErrorMessage(error)
      });
    }
  }
);

/**
 * PUT /api/campaigns/:id
 * キャンペーン更新（管理者のみ）
 */
router.put('/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = {};

      // 更新可能フィールド
      const allowedFields = [
        'name',
        'description',
        'start_date',
        'end_date',
        'bonus_type',
        'bonus_value',
        'target_products',
        'target_tiers',
        'target_agencies',
        'conditions',
        'max_bonus_per_agency',
        'is_active'
      ];

      // データベーススキーマに合わせて変換
      const campaignUpdates = {};

      Object.keys(req.body).forEach(field => {
        if (allowedFields.includes(field) && req.body[field] !== undefined) {
          if (field === 'bonus_type' || field === 'bonus_value') {
            // bonus_typeとbonus_valueをbonus_rateとbonus_amountに変換
            if (req.body.bonus_type && req.body.bonus_value !== undefined) {
              if (req.body.bonus_type === 'percentage') {
                campaignUpdates.bonus_rate = req.body.bonus_value;
                campaignUpdates.bonus_amount = null;
              } else {
                campaignUpdates.bonus_rate = null;
                campaignUpdates.bonus_amount = req.body.bonus_value;
              }
            }
          } else if (field === 'target_tiers') {
            campaignUpdates.target_tier_levels = req.body[field];
          } else if (field === 'target_products' || field === 'target_agencies' || field === 'max_bonus_per_agency') {
            // これらはconditionsに保存
            if (!campaignUpdates.conditions) {
              campaignUpdates.conditions = {};
            }
            if (field === 'max_bonus_per_agency') {
              campaignUpdates.conditions[field] = req.body[field];
            } else {
              campaignUpdates.conditions[field] = req.body[field];
            }
          } else if (field === 'conditions') {
            campaignUpdates.conditions = {
              ...(campaignUpdates.conditions || {}),
              ...req.body[field]
            };
          } else {
            campaignUpdates[field] = req.body[field];
          }
        }
      });

      // bonus_typeをconditionsに保存
      if (req.body.bonus_type) {
        if (!campaignUpdates.conditions) {
          campaignUpdates.conditions = {};
        }
        campaignUpdates.conditions.bonus_type = req.body.bonus_type;
      }

      // 期間の妥当性チェック
      if (campaignUpdates.start_date && campaignUpdates.end_date) {
        if (new Date(campaignUpdates.end_date) <= new Date(campaignUpdates.start_date)) {
          return res.status(400).json({
            success: false,
            message: '終了日は開始日より後に設定してください'
          });
        }
      }

      campaignUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('campaigns')
        .update(campaignUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'キャンペーンが見つかりません'
        });
      }

      res.json({
        success: true,
        message: 'キャンペーンを更新しました',
        data
      });
    } catch (error) {
      console.error('Update campaign error:', error);
      res.status(500).json({
        success: false,
        message: safeErrorMessage(error)
      });
    }
  }
);

/**
 * DELETE /api/campaigns/:id
 * キャンペーン削除（論理削除、管理者のみ）
 */
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 論理削除（is_activeをfalseに）
      const { data, error } = await supabase
        .from('campaigns')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          deleted_by: req.user.id
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'キャンペーンが見つかりません'
        });
      }

      res.json({
        success: true,
        message: 'キャンペーンを削除しました'
      });
    } catch (error) {
      console.error('Delete campaign error:', error);
      res.status(500).json({
        success: false,
        message: safeErrorMessage(error)
      });
    }
  }
);

/**
 * キャンペーンの状態を判定
 */
function getCampaignStatus(campaign) {
  const now = new Date();
  const start = new Date(campaign.start_date);
  const end = new Date(campaign.end_date);

  if (!campaign.is_active) {
    return 'inactive';
  }

  if (now < start) {
    return 'scheduled'; // 開始前
  }

  if (now > end) {
    return 'expired'; // 終了
  }

  return 'active'; // 実施中
}

/**
 * キャンペーンの実績を取得
 */
async function getCampaignStats(campaignId) {
  try {
    // キャンペーン期間中の報酬を集計
    // commissionsテーブルにはcampaign_idカラムがないので、campaign_bonusが存在するものをカウント
    const { data, error } = await supabase
      .from('commissions')
      .select('campaign_bonus, agency_id')
      .not('campaign_bonus', 'is', null)
      .gt('campaign_bonus', 0);

    if (error) throw error;

    const totalBonus = data?.reduce((sum, c) => sum + (c.campaign_bonus || 0), 0) || 0;
    const agencyCount = new Set(data?.map(c => c.agency_id) || []).size;

    return {
      total_bonus: totalBonus,
      agency_count: agencyCount,
      bonus_count: data?.length || 0
    };
  } catch (error) {
    console.error('Get campaign stats error:', error);
    return {
      total_bonus: 0,
      agency_count: 0,
      bonus_count: 0
    };
  }
}

module.exports = router;