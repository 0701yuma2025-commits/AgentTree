/**
 * 売上 登録・更新・削除API
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../../config/supabase');
const { authenticateToken } = require('../../middleware/auth');
const { calculateCommissionForSale, calculateCampaignBonusNew, DEFAULT_COMMISSION_SETTINGS } = require('../../utils/calculateCommission');
const { detectAnomalies } = require('../../utils/anomalyDetection');
const { generateSaleNumber } = require('../../utils/generateCode');
const { sendAnomalyNotification } = require('./anomaly');
const { recordViolation } = require('../../utils/violationManager');
const emailService = require('../../services/emailService');
const { handleDbError } = require('../../utils/errorHelper');
const { createModuleLogger } = require('../../config/logger');
const logger = createModuleLogger('sales-mutations');


/**
 * 親代理店チェーンを取得
 */
async function getParentChain(parentAgencyId) {
  const chain = [];
  let currentParentId = parentAgencyId;
  while (currentParentId) {
    const { data: parentAgency } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', currentParentId)
      .single();
    if (parentAgency) {
      chain.push(parentAgency);
      currentParentId = parentAgency.parent_agency_id;
    } else {
      break;
    }
  }
  return chain;
}

/**
 * 報酬レコードを新規作成（基本報酬 + 親代理店ボーナス）
 * 全レコードを1回のINSERTでアトミックに投入する
 */
async function createCommissionRecords(sale, commissionResult, settings) {
  const month = new Date(sale.sale_date).toISOString().slice(0, 7);
  const appliedSettings = {
    tier1_from_tier2_bonus: settings.tier1_from_tier2_bonus,
    tier2_from_tier3_bonus: settings.tier2_from_tier3_bonus,
    tier3_from_tier4_bonus: settings.tier3_from_tier4_bonus,
    minimum_payment_amount: settings.minimum_payment_amount,
    withholding_tax_rate: settings.withholding_tax_rate,
    non_invoice_deduction_rate: settings.non_invoice_deduction_rate
  };

  const calculationDetails = {
    ...(commissionResult.calculation_details || {}),
    applied_settings: appliedSettings
  };

  // 全報酬レコードを配列に集約
  const records = [];

  // 基本報酬
  records.push({
    sale_id: sale.id,
    agency_id: sale.agency_id,
    month,
    base_amount: commissionResult.base_amount,
    tier_bonus: commissionResult.tier_bonus || 0,
    campaign_bonus: commissionResult.campaign_bonus || 0,
    withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
    final_amount: commissionResult.final_amount,
    status: 'confirmed',
    tier_level: sale.tier_level || commissionResult.tier_level,
    calculation_details: calculationDetails
  });

  // 親代理店ボーナス
  if (commissionResult.parent_commissions?.length > 0) {
    for (const pc of commissionResult.parent_commissions) {
      records.push({
        sale_id: sale.id,
        agency_id: pc.agency_id,
        month,
        base_amount: 0,
        tier_bonus: pc.amount,
        campaign_bonus: 0,
        withholding_tax: 0,
        final_amount: pc.amount,
        status: 'confirmed',
        tier_level: pc.tier_level,
        calculation_details: {
          type: 'hierarchy_bonus',
          from_agency_id: sale.agency_id,
          bonus_rate: pc.bonus_rate,
          applied_settings: appliedSettings
        }
      });
    }
  }

  // 1回のINSERTでアトミックに投入（全成功 or 全失敗）
  const { error } = await supabase.from('commissions').insert(records);
  if (error) throw error;
}

/**
 * POST /api/sales
 * 売上登録
 */
router.post('/',
  authenticateToken,
  [
    body('product_id').isUUID().withMessage('商品IDが不正です'),
    body('quantity').isInt({ min: 1 }).withMessage('数量は1以上必要です'),
    body('customer_name').notEmpty().withMessage('顧客名は必須です'),
    body('sale_date').isISO8601().withMessage('売上日が不正です')
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
        product_id,
        quantity,
        customer_name,
        customer_email,
        sale_date,
        notes
      } = req.body;

      // 代理店IDを取得
      let agency_id = req.body.agency_id;
      if (req.user.role === 'agency' && req.user.agency) {
        agency_id = req.user.agency.id;
      }

      if (!agency_id) {
        return res.status(400).json({
          success: false,
          message: '代理店IDが指定されていません'
        });
      }

      // 商品情報取得
      const { data: product } = await supabase
        .from('products')
        .select('price')
        .eq('id', product_id)
        .single();

      if (!product) {
        return res.status(400).json({
          success: false,
          message: '商品が見つかりません'
        });
      }

      const total_amount = product.price * quantity;

      // 短時間内の重複売上チェック（30秒以内の同一内容を拒否）
      const { data: recentDuplicate } = await supabase
        .from('sales')
        .select('id')
        .eq('agency_id', agency_id)
        .eq('product_id', product_id)
        .eq('quantity', quantity)
        .eq('customer_name', customer_name)
        .gte('created_at', new Date(Date.now() - 30 * 1000).toISOString())
        .limit(1);

      if (recentDuplicate && recentDuplicate.length > 0) {
        return res.status(409).json({
          success: false,
          message: '同一内容の売上が直前に登録されています。重複登録を防止しました。'
        });
      }

      // 売上番号生成（統一形式を使用）
      const sale_number = await generateSaleNumber();

      // 売上登録
      const { data, error } = await supabase
        .from('sales')
        .insert({
          sale_number,
          agency_id,
          product_id,
          quantity,
          unit_price: product.price,
          total_amount,
          customer_name,
          customer_email,
          sale_date,
          notes,
          status: 'confirmed',
          anomaly_detected: false,  // 初期値
          anomaly_score: 0,
          anomaly_reasons: null
        })
        .select()
        .single();

      if (error) throw error;

      // 異常検知を実行
      const anomalyResult = await detectAnomalies(data);

      // 異常が検知された場合、売上レコードを更新
      if (anomalyResult.has_anomaly) {
        const { error: updateError } = await supabase
          .from('sales')
          .update({
            anomaly_detected: true,
            anomaly_score: anomalyResult.anomaly_score,
            anomaly_reasons: anomalyResult.reasons,
            requires_review: true
          })
          .eq('id', data.id);

        if (updateError) {
          logger.error('異常フラグ更新エラー:', updateError.message);
        }

        // 管理者に通知を送信
        try {
          await sendAnomalyNotification(data, anomalyResult);
        } catch (notifyError) {
          logger.error('異常通知送信エラー:', notifyError.message);
        }

        // スコア70以上の場合、違反としてカウント
        if (anomalyResult.anomaly_score >= 70) {
          try {
            await recordViolation(data.agency_id, anomalyResult);
          } catch (violationError) {
            logger.error('違反記録エラー:', violationError.message);
          }
        }
      }

      // 報酬を自動計算して登録（失敗時は売上もロールバック）
      let commissionCreated = false;
      try {
        // 代理店情報を取得
        const { data: agencyData } = await supabase
          .from('agencies')
          .select('*')
          .eq('id', agency_id)
          .single();

        if (agencyData) {
          // 親代理店チェーンを取得
          let parentChain = [];
          let currentParentId = agencyData.parent_agency_id;

          while (currentParentId) {
            const { data: parentAgency } = await supabase
              .from('agencies')
              .select('*')
              .eq('id', currentParentId)
              .single();

            if (parentAgency) {
              parentChain.push(parentAgency);
              currentParentId = parentAgency.parent_agency_id;
            } else {
              break;
            }
          }

          // 有効なキャンペーンを取得
          const { data: activeCampaigns } = await supabase
            .from('campaigns')
            .select('*')
            .lte('start_date', sale_date)
            .gte('end_date', sale_date)
            .eq('is_active', true);

          // 報酬設定を取得（売上登録時の設定値で確定）
          const { data: commissionSettings } = await supabase
            .from('commission_settings')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const settings = commissionSettings || DEFAULT_COMMISSION_SETTINGS;

          // 報酬を計算（売上登録時の設定値を適用）
          const commissionResult = calculateCommissionForSale(data, agencyData, product, parentChain, settings);

          // キャンペーンボーナスの計算（有効なキャンペーンがある場合）
          let campaignBonusResult = { total: 0, details: [] };
          if (activeCampaigns && activeCampaigns.length > 0) {
            // DB形式→計算関数の期待する形式に変換
            const normalizedCampaigns = activeCampaigns.map(c => ({
              ...c,
              bonus_type: c.conditions?.bonus_type || (c.bonus_rate !== null ? 'percentage' : 'fixed'),
              bonus_value: c.bonus_rate !== null ? c.bonus_rate : c.bonus_amount,
              target_products: c.conditions?.target_products || null,
              target_agencies: c.conditions?.target_agencies || null,
              target_tiers: c.target_tier_levels || [1, 2, 3, 4],
              max_bonus_per_agency: c.conditions?.max_bonus_per_agency || null
            }));
            campaignBonusResult = calculateCampaignBonusNew(data, agencyData, product, normalizedCampaigns);
          }
          commissionResult.campaign_bonus = campaignBonusResult.total;
          commissionResult.final_amount += campaignBonusResult.total;

          // 報酬レコードを作成
          const month = new Date(sale_date).toISOString().slice(0, 7); // YYYY-MM形式

          // 計算詳細に設定値を保存（編集時に使用）
          const calculationDetails = {
            ...(commissionResult.calculation_details || {}),
            campaign_bonus_details: campaignBonusResult.details.length > 0 ? campaignBonusResult.details : undefined,
            applied_settings: {
              tier1_from_tier2_bonus: settings.tier1_from_tier2_bonus,
              tier2_from_tier3_bonus: settings.tier2_from_tier3_bonus,
              tier3_from_tier4_bonus: settings.tier3_from_tier4_bonus,
              minimum_payment_amount: settings.minimum_payment_amount,
              withholding_tax_rate: settings.withholding_tax_rate,
              non_invoice_deduction_rate: settings.non_invoice_deduction_rate
            }
          };

          // 全報酬レコードを配列に集約し、1回のINSERTでアトミックに投入
          const commissionRecords = [];

          // 基本報酬
          commissionRecords.push({
            sale_id: data.id,
            agency_id: agency_id,
            month: month,
            base_amount: commissionResult.base_amount,
            tier_bonus: commissionResult.tier_bonus || 0,
            campaign_bonus: commissionResult.campaign_bonus || 0,
            withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
            final_amount: commissionResult.final_amount,
            status: 'confirmed',
            tier_level: agencyData.tier_level,
            calculation_details: calculationDetails
          });

          // 親代理店の階層ボーナス
          if (commissionResult.parent_commissions && commissionResult.parent_commissions.length > 0) {
            for (const parentCommission of commissionResult.parent_commissions) {
              commissionRecords.push({
                sale_id: data.id,
                agency_id: parentCommission.agency_id,
                month: month,
                base_amount: 0,
                tier_bonus: parentCommission.amount,
                campaign_bonus: 0,
                withholding_tax: 0,
                final_amount: parentCommission.amount,
                status: 'confirmed',
                tier_level: parentCommission.tier_level,
                calculation_details: {
                  type: 'hierarchy_bonus',
                  from_agency_id: agency_id,
                  bonus_rate: parentCommission.bonus_rate,
                  applied_settings: {
                    tier1_from_tier2_bonus: settings.tier1_from_tier2_bonus,
                    tier2_from_tier3_bonus: settings.tier2_from_tier3_bonus,
                    tier3_from_tier4_bonus: settings.tier3_from_tier4_bonus,
                    minimum_payment_amount: settings.minimum_payment_amount,
                    withholding_tax_rate: settings.withholding_tax_rate,
                    non_invoice_deduction_rate: settings.non_invoice_deduction_rate
                  }
                }
              });
            }
          }

          // 全レコードを1回のINSERTで投入（全成功 or 全失敗）
          const { error: commissionError } = await supabase
            .from('commissions')
            .insert(commissionRecords);

          if (commissionError) {
            throw new Error(`報酬レコード作成失敗: ${commissionError.message}`);
          }

          commissionCreated = true;
        }
      } catch (commissionCalcError) {
        logger.error('Commission calculation/creation error, rolling back sale:', commissionCalcError.message);
        // 補償トランザクション: 売上と（もしあれば）報酬を削除
        await supabase.from('commissions').delete().eq('sale_id', data.id);
        await supabase.from('sales').delete().eq('id', data.id);
        return res.status(500).json({
          success: false,
          message: '売上登録に失敗しました（報酬計算エラー）'
        });
      }

      // 売上通知メール送信
      try {
        // 商品名を取得
        const { data: productInfo } = await supabase
          .from('products')
          .select('name')
          .eq('id', product_id)
          .single();

        // 代理店のメールアドレスを取得
        const { data: agencyInfo } = await supabase
          .from('agencies')
          .select('contact_email')
          .eq('id', agency_id)
          .single();

        // 報酬額を取得（計算された場合）
        let commissionAmount = 0;
        try {
          const { data: commissionData } = await supabase
            .from('commissions')
            .select('final_amount')
            .eq('sale_id', data.id)
            .eq('agency_id', agency_id)
            .single();
          if (commissionData) {
            commissionAmount = commissionData.final_amount;
          }
        } catch (err) {
          // 報酬がない場合は0のまま
        }

        if (agencyInfo && agencyInfo.contact_email) {
          await emailService.sendSalesNotification({
            sale_number,
            product_name: productInfo ? productInfo.name : '商品',
            sale_amount: total_amount,
            commission_amount: commissionAmount
          }, agencyInfo.contact_email);
        }
      } catch (emailError) {
        logger.error('Sales notification email error:', emailError.message);
      }

      res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Create sale error:', error.message);
      const dbErr = handleDbError(error);
      res.status(dbErr?.status || 500).json({
        success: false,
        message: dbErr?.message || 'データの作成に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/sales/:id
 * 売上情報更新
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      product_id,
      quantity,
      unit_price,
      notes,
      sale_date,
      status
    } = req.body;

    // 入力バリデーション
    if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 1)) {
      return res.status(400).json({ success: false, message: '数量は1以上の数値で指定してください' });
    }
    if (unit_price !== undefined && (typeof unit_price !== 'number' || unit_price < 0)) {
      return res.status(400).json({ success: false, message: '単価は0以上の数値で指定してください' });
    }
    if (status !== undefined) {
      const validStatuses = ['pending', 'confirmed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `ステータスが無効です。有効な値: ${validStatuses.join(', ')}` });
      }
    }
    if (sale_date !== undefined && isNaN(Date.parse(sale_date))) {
      return res.status(400).json({ success: false, message: '売上日の形式が無効です' });
    }

    // 売上情報を取得
    const { data: currentSale, error: fetchError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentSale) {
      return res.status(404).json({
        success: false,
        message: '売上情報が見つかりません'
      });
    }

    // ステータスベースの権限チェック
    const isAdmin = req.user.role === 'admin';
    const isAgency = req.user.role === 'agency';

    // 代理店は自社の売上のみ編集可能
    if (isAgency && currentSale.agency_id !== req.user.agency?.id) {
      return res.status(403).json({
        success: false,
        message: '他の代理店の売上を編集する権限がありません'
      });
    }

    // ステータス別の編集可能フィールドを定義
    const editableFields = {
      pending: ['customer_name', 'customer_email', 'customer_phone', 'customer_address', 'product_id', 'quantity', 'unit_price', 'notes', 'sale_date'],
      confirmed: ['customer_name', 'customer_email', 'customer_phone', 'customer_address'],
      paid: [] // 支払済みは編集不可
    };

    // 管理者は常に全フィールド編集可能
    if (!isAdmin) {
      const allowedFields = editableFields[currentSale.status] || [];

      if (currentSale.status === 'paid') {
        return res.status(403).json({
          success: false,
          message: '支払済みの売上は編集できません'
        });
      }

      // リクエストされたフィールドが編集可能かチェック
      const requestedFields = Object.keys(req.body);
      const unauthorizedFields = requestedFields.filter(field =>
        !allowedFields.includes(field) && field !== 'id'
      );

      if (unauthorizedFields.length > 0) {
        return res.status(403).json({
          success: false,
          message: `現在のステータス (${currentSale.status}) では以下のフィールドは編集できません: ${unauthorizedFields.join(', ')}`
        });
      }
    }

    // 更新データ準備と変更履歴記録
    const updateData = {
      updated_at: new Date().toISOString()
    };

    const changeHistory = [];

    // フィールドのラベルマッピング
    const fieldLabels = {
      customer_name: '顧客名',
      customer_email: '顧客メール',
      customer_phone: '顧客電話番号',
      customer_address: '顧客住所',
      product_id: '商品',
      quantity: '数量',
      unit_price: '単価',
      notes: '備考',
      sale_date: '売上日',
      status: 'ステータス'
    };

    // 更新可能なフィールドのみ設定し、変更履歴を記録
    if (customer_name !== undefined && customer_name !== currentSale.customer_name) {
      updateData.customer_name = customer_name;
      changeHistory.push({
        field_name: fieldLabels.customer_name,
        old_value: currentSale.customer_name || '',
        new_value: customer_name
      });
    }
    if (customer_email !== undefined && customer_email !== currentSale.customer_email) {
      updateData.customer_email = customer_email;
      changeHistory.push({
        field_name: fieldLabels.customer_email,
        old_value: currentSale.customer_email || '',
        new_value: customer_email
      });
    }
    if (customer_phone !== undefined && customer_phone !== currentSale.customer_phone) {
      updateData.customer_phone = customer_phone;
      changeHistory.push({
        field_name: fieldLabels.customer_phone,
        old_value: currentSale.customer_phone || '',
        new_value: customer_phone
      });
    }
    if (customer_address !== undefined && customer_address !== currentSale.customer_address) {
      updateData.customer_address = customer_address;
      changeHistory.push({
        field_name: fieldLabels.customer_address,
        old_value: currentSale.customer_address || '',
        new_value: customer_address
      });
    }
    if (product_id !== undefined && product_id !== currentSale.product_id) {
      updateData.product_id = product_id;
      changeHistory.push({
        field_name: fieldLabels.product_id,
        old_value: currentSale.product_id || '',
        new_value: product_id
      });
    }
    if (quantity !== undefined && quantity !== currentSale.quantity) {
      updateData.quantity = quantity;
      changeHistory.push({
        field_name: fieldLabels.quantity,
        old_value: String(currentSale.quantity || 0),
        new_value: String(quantity)
      });
    }
    if (unit_price !== undefined && unit_price !== currentSale.unit_price) {
      updateData.unit_price = unit_price;
      changeHistory.push({
        field_name: fieldLabels.unit_price,
        old_value: String(currentSale.unit_price || 0),
        new_value: String(unit_price)
      });
    }
    if (notes !== undefined && notes !== currentSale.notes) {
      updateData.notes = notes;
      changeHistory.push({
        field_name: fieldLabels.notes,
        old_value: currentSale.notes || '',
        new_value: notes
      });
    }
    if (sale_date !== undefined && sale_date !== currentSale.sale_date) {
      updateData.sale_date = sale_date;
      changeHistory.push({
        field_name: fieldLabels.sale_date,
        old_value: currentSale.sale_date || '',
        new_value: sale_date
      });
    }
    if (status !== undefined && status !== currentSale.status) {
      updateData.status = status;
      changeHistory.push({
        field_name: fieldLabels.status,
        old_value: currentSale.status || '',
        new_value: status
      });
    }

    // 合計金額を再計算
    if (quantity !== undefined || unit_price !== undefined) {
      const newQuantity = quantity !== undefined ? quantity : currentSale.quantity;
      const newUnitPrice = unit_price !== undefined ? unit_price : currentSale.unit_price;
      const newTotalAmount = newQuantity * newUnitPrice;

      if (newTotalAmount !== currentSale.total_amount) {
        updateData.total_amount = newTotalAmount;
        changeHistory.push({
          field_name: '合計金額',
          old_value: String(currentSale.total_amount || 0),
          new_value: String(newTotalAmount)
        });
      }
    }

    // 変更がない場合
    if (changeHistory.length === 0) {
      return res.json({
        success: true,
        message: '変更はありませんでした',
        data: currentSale
      });
    }

    // 更新実行
    const { data, error } = await supabase
      .from('sales')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '売上情報が見つかりません'
      });
    }

    // 変更履歴をデータベースに保存
    if (changeHistory.length > 0) {
      try {
        const historyRecords = changeHistory.map(change => ({
          sale_id: id,
          changed_by: req.user.id,
          changed_at: new Date().toISOString(),
          field_name: change.field_name,
          old_value: change.old_value,
          new_value: change.new_value
        }));

        const { error: historyError } = await supabase
          .from('sale_change_history')
          .insert(historyRecords);

        if (historyError) {
          logger.error('変更履歴の保存エラー:', historyError.message);
          // 履歴保存エラーは売上更新の成功には影響しない
        }
      } catch (historyError) {
        logger.error('変更履歴の保存エラー:', historyError.message);
      }
    }

    // 金額が変更された場合、関連する報酬を再計算
    if (quantity !== undefined || unit_price !== undefined) {
      try {
        const { data: relatedCommissions, error: commError } = await supabase
          .from('commissions').select('*').eq('sale_id', id);

        if (!commError) {
          const { data: agency } = await supabase.from('agencies').select('*').eq('id', data.agency_id).single();
          const { data: product } = await supabase.from('products').select('*').eq('id', data.product_id).single();

          if (agency && product) {
            const parentChain = await getParentChain(agency.parent_agency_id);

            if (relatedCommissions && relatedCommissions.length > 0) {
              // 既存報酬を更新：登録時の設定値を維持
              const settings = relatedCommissions[0].calculation_details?.applied_settings || DEFAULT_COMMISSION_SETTINGS;
              const commissionResult = calculateCommissionForSale(data, agency, product, parentChain, settings);
              const month = new Date(data.sale_date).toISOString().slice(0, 7);

              for (const commission of relatedCommissions) {
                if (commission.base_amount > 0) {
                  await supabase.from('commissions').update({
                    month, base_amount: commissionResult.base_amount, tier_bonus: 0, campaign_bonus: 0,
                    withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
                    final_amount: commissionResult.final_amount, updated_at: new Date().toISOString()
                  }).eq('id', commission.id);
                } else if (commission.tier_bonus > 0) {
                  const pc = commissionResult.parent_commissions?.find(p => p.agency_id === commission.agency_id);
                  if (pc) {
                    await supabase.from('commissions').update({
                      month, tier_bonus: pc.amount, final_amount: pc.amount, updated_at: new Date().toISOString()
                    }).eq('id', commission.id);
                  }
                }
              }
            } else {
              // 報酬なし → 新規作成
              const { data: commissionSettings } = await supabase
                .from('commission_settings').select('*').eq('is_active', true)
                .order('created_at', { ascending: false }).limit(1).single();
              const settings = commissionSettings || DEFAULT_COMMISSION_SETTINGS;
              const commissionResult = calculateCommissionForSale(data, agency, product, parentChain, settings);
              await createCommissionRecords({ ...data, tier_level: agency.tier_level }, commissionResult, settings);
            }
          }
        }
      } catch (commissionUpdateError) {
        logger.error('報酬再計算エラー:', commissionUpdateError.message);
        return res.json({
          success: true, message: '売上情報を更新しました',
          warning: '報酬の再計算に失敗しました。管理者に確認してください。', data
        });
      }
    }

    res.json({
      success: true,
      message: '売上情報を更新しました',
      data
    });
  } catch (error) {
    logger.error('Update sale error:', error.message);
    const dbErr = handleDbError(error);
    res.status(dbErr?.status || 500).json({
      success: false,
      message: dbErr?.message || 'データの更新に失敗しました'
    });
  }
});

/**
 * DELETE /api/sales/:id
 * 売上情報削除（物理削除）
 * ※関連する報酬レコードもCASCADE削除されます
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 権限チェック（管理者のみ削除可能）
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '売上情報を削除する権限がありません'
      });
    }

    // 1. 関連する通知履歴を削除（テーブルが存在する場合のみ）
    try {
      await supabase
        .from('notification_history')
        .delete()
        .contains('related_data', { sale_id: id });
    } catch (notificationError) {
      // notification_historyテーブルが存在しない場合はスキップ
      logger.info('Notification history deletion skipped:', notificationError.message);
    }

    // 2. 売上を物理削除（報酬は自動CASCADE削除）
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '売上情報を削除しました'
    });
  } catch (error) {
    logger.error('Delete sale error:', error.message);
    const dbErr = handleDbError(error);
    res.status(dbErr?.status || 500).json({
      success: false,
      message: dbErr?.message || 'データの削除に失敗しました'
    });
  }
});

module.exports = router;
