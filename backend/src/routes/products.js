/**
 * 商品管理ルート
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken: authMiddleware, requireAdmin } = require('../middleware/auth');
const { generateProductCode } = require('../utils/generateCode');

/**
 * 商品一覧取得
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('product_code', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: products || []
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 商品詳細取得
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!product) {
      return res.status(404).json({
        success: false,
        message: '商品が見つかりません'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 商品登録（管理者と代理店）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      product_name,
      price,
      commission_rate_tier1,
      commission_rate_tier2,
      commission_rate_tier3,
      commission_rate_tier4,
      description
    } = req.body;

    // バリデーション
    if (!product_name || !price) {
      return res.status(400).json({
        success: false,
        message: '商品名、価格は必須です'
      });
    }

    // 商品コードを自動生成
    const product_code = await generateProductCode();

    // 代理店の場合、作成者情報を取得
    let createdByAgencyId = null;
    if (req.user.role === 'agency') {
      createdByAgencyId = req.user.agency_id;
    }

    // 商品登録
    const insertData = {
      product_code,
      name: product_name,
      price,
      tier1_commission_rate: commission_rate_tier1 || 10.00,
      tier2_commission_rate: commission_rate_tier2 || 8.00,
      tier3_commission_rate: commission_rate_tier3 || 6.00,
      tier4_commission_rate: commission_rate_tier4 || 4.00,
      description: description || null
    };

    // 代理店が作成した場合のみcreated_by_agency_idを記録
    if (createdByAgencyId) {
      insertData.created_by_agency_id = createdByAgencyId;
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          success: false,
          message: 'この商品コードは既に使用されています'
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: '商品を登録しました',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 商品更新（管理者と代理店、階層に応じた報酬率編集権限）
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {};

    // 代理店の場合、階層を取得
    let agencyTier = null;
    if (req.user.role === 'agency') {
      const { data: agency, error: agencyError } = await supabase
        .from('agencies')
        .select('tier_level')
        .eq('id', req.user.agency_id)
        .single();

      if (agencyError || !agency) {
        return res.status(403).json({
          success: false,
          message: '代理店情報が見つかりません'
        });
      }
      agencyTier = agency.tier_level;
    }

    // 基本フィールド（全員編集可能）
    const basicFields = ['name', 'price', 'description', 'is_active'];
    basicFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // 報酬率フィールドの編集権限チェック
    const commissionFields = {
      'commission_rate_tier1': 'tier1_commission_rate',
      'commission_rate_tier2': 'tier2_commission_rate',
      'commission_rate_tier3': 'tier3_commission_rate',
      'commission_rate_tier4': 'tier4_commission_rate'
    };

    Object.entries(commissionFields).forEach(([requestField, dbField]) => {
      if (req.body[requestField] !== undefined) {
        // 管理者は全て編集可能
        if (req.user.role === 'admin' || req.user.role === 'super_admin') {
          updateData[dbField] = req.body[requestField];
        }
        // 代理店の場合、階層に応じて制限
        else if (req.user.role === 'agency') {
          const tierNumber = parseInt(requestField.match(/tier(\d)/)[1]);

          // Tier1: 全階層編集可能
          if (agencyTier === 1) {
            updateData[dbField] = req.body[requestField];
          }
          // Tier2: Tier1以外編集可能
          else if (agencyTier === 2 && tierNumber !== 1) {
            updateData[dbField] = req.body[requestField];
          }
          // Tier3: Tier3とTier4のみ編集可能
          else if (agencyTier === 3 && tierNumber >= 3) {
            updateData[dbField] = req.body[requestField];
          }
          // Tier4: Tier4のみ編集可能
          else if (agencyTier === 4 && tierNumber === 4) {
            updateData[dbField] = req.body[requestField];
          }
        }
      }
    });

    updateData.updated_at = new Date().toISOString();

    const { data: product, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!product) {
      return res.status(404).json({
        success: false,
        message: '商品が見つかりません'
      });
    }

    res.json({
      success: true,
      message: '商品を更新しました',
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 商品削除（論理削除、管理者と代理店）
 */
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 論理削除（is_activeをfalseに）
    const { data: product, error } = await supabase
      .from('products')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!product) {
      return res.status(404).json({
        success: false,
        message: '商品が見つかりません'
      });
    }

    res.json({
      success: true,
      message: '商品を削除しました'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;