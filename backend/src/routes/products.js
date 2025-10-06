/**
 * 商品管理ルート
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken: authMiddleware } = require('../middleware/auth');
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
 * 商品登録（管理者のみ）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '商品を登録する権限がありません'
      });
    }

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

    // 商品登録
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        product_code,
        name: product_name,  // カラム名をnameに修正
        price,
        tier1_commission_rate: commission_rate_tier1 || 10.00,
        tier2_commission_rate: commission_rate_tier2 || 8.00,
        tier3_commission_rate: commission_rate_tier3 || 6.00,
        tier4_commission_rate: commission_rate_tier4 || 4.00,
        description: description || null
      })
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
 * 商品更新（管理者のみ）
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '商品を更新する権限がありません'
      });
    }

    const { id } = req.params;
    const updateData = {};

    // 更新可能フィールドのみ設定
    const allowedFields = [
      'name',  // product_name → name に修正
      'price',
      'commission_rate_tier1',
      'commission_rate_tier2',
      'commission_rate_tier3',
      'commission_rate_tier4',
      'description',
      'is_active'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
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
 * 商品削除（論理削除、管理者のみ）
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '商品を削除する権限がありません'
      });
    }

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