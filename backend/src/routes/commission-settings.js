/**
 * 報酬設定管理ルート
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken: authMiddleware } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/errorHelper');

/**
 * 現在有効な報酬設定を取得
 */
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('commission_settings')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', new Date().toISOString())
      .or('valid_to.is.null,valid_to.gte.' + new Date().toISOString())
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // デフォルト設定
    const defaultSettings = {
      minimum_payment_amount: 10000,
      payment_cycle: 'monthly',
      payment_day: 25,
      closing_day: 31,
      tier1_from_tier2_bonus: 2.00,
      tier2_from_tier3_bonus: 1.50,
      tier3_from_tier4_bonus: 1.00,
      withholding_tax_rate: 10.21,
      non_invoice_deduction_rate: 2.00
    };

    res.json({
      success: true,
      data: settings || defaultSettings
    });
  } catch (error) {
    console.error('Get commission settings error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * 報酬設定履歴を取得（管理者のみ）
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '報酬設定履歴を閲覧する権限がありません'
      });
    }

    const { data: settings, error } = await supabase
      .from('commission_settings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: settings || []
    });
  } catch (error) {
    console.error('Get commission settings history error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * 報酬設定を更新（管理者のみ）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '報酬設定を更新する権限がありません'
      });
    }

    const {
      minimum_payment_amount,
      payment_cycle,
      payment_day,
      closing_day,
      tier1_from_tier2_bonus,
      tier2_from_tier3_bonus,
      tier3_from_tier4_bonus,
      withholding_tax_rate,
      non_invoice_deduction_rate,
      valid_from
    } = req.body;

    // 既存の有効な設定を無効化
    await supabase
      .from('commission_settings')
      .update({
        is_active: false,
        valid_to: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: req.user.id
      })
      .eq('is_active', true);

    // 新しい設定を作成
    const { data: newSettings, error } = await supabase
      .from('commission_settings')
      .insert({
        minimum_payment_amount: minimum_payment_amount || 10000,
        payment_cycle: payment_cycle || 'monthly',
        payment_day: payment_day || 25,
        closing_day: closing_day || 31,
        tier1_from_tier2_bonus: tier1_from_tier2_bonus || 2.00,
        tier2_from_tier3_bonus: tier2_from_tier3_bonus || 1.50,
        tier3_from_tier4_bonus: tier3_from_tier4_bonus || 1.00,
        withholding_tax_rate: withholding_tax_rate || 10.21,
        non_invoice_deduction_rate: non_invoice_deduction_rate || 2.00,
        valid_from: valid_from || new Date().toISOString(),
        is_active: true,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: '報酬設定を更新しました',
      data: newSettings
    });
  } catch (error) {
    console.error('Update commission settings error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

/**
 * 支払い予定日を計算
 */
router.get('/next-payment-date', authMiddleware, async (req, res) => {
  try {
    // 現在の設定を取得
    const { data: settings, error } = await supabase
      .from('commission_settings')
      .select('payment_cycle, payment_day, closing_day')
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const paymentCycle = settings?.payment_cycle || 'monthly';
    const paymentDay = settings?.payment_day || 25;
    const closingDay = settings?.closing_day || 31;

    const today = new Date();
    let nextPaymentDate = new Date();

    if (paymentCycle === 'monthly') {
      // 今月の締め日を計算
      const closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay);

      // 締め日を過ぎている場合は来月の支払い
      if (today > closingDate) {
        nextPaymentDate = new Date(today.getFullYear(), today.getMonth() + 1, paymentDay);
      } else {
        nextPaymentDate = new Date(today.getFullYear(), today.getMonth(), paymentDay);
      }

      // 支払い日が過ぎている場合は翌月
      if (nextPaymentDate < today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
    } else if (paymentCycle === 'weekly') {
      // 週次の場合は次の月曜日
      const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
      nextPaymentDate.setDate(today.getDate() + daysUntilMonday);
    } else if (paymentCycle === 'biweekly') {
      // 隔週の場合
      nextPaymentDate.setDate(today.getDate() + 14);
    }

    res.json({
      success: true,
      data: {
        next_payment_date: nextPaymentDate.toISOString().split('T')[0],
        payment_cycle: paymentCycle,
        payment_day: paymentDay,
        closing_day: closingDay
      }
    });
  } catch (error) {
    console.error('Calculate next payment date error:', error);
    res.status(500).json({
      success: false,
      message: safeErrorMessage(error)
    });
  }
});

module.exports = router;