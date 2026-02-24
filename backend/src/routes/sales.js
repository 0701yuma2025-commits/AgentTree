/**
 * 売上管理API
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const { calculateCommissionForSale } = require('../utils/calculateCommission');
const { detectAnomalies } = require('../utils/anomalyDetection');
const { generateSaleNumber } = require('../utils/generateCode');
const emailService = require('../services/emailService');
const { Parser } = require('json2csv');

/**
 * 異常検知通知を送信
 */
async function sendAnomalyNotification(sale, anomalyResult) {
  // 管理者のメールアドレスを取得
  const { data: admins } = await supabase
    .from('users')
    .select('email, full_name')
    .in('role', ['admin', 'super_admin']);

  if (!admins || admins.length === 0) return;

  // 代理店情報を取得
  const { data: agency } = await supabase
    .from('agencies')
    .select('company_name, agency_code')
    .eq('id', sale.agency_id)
    .single();

  const emailContent = `
    <h2>⚠️ 売上異常検知アラート</h2>
    <p>以下の売上で異常が検知されました。確認が必要です。</p>

    <h3>売上情報</h3>
    <ul>
      <li>売上番号: ${sale.sale_number}</li>
      <li>代理店: ${agency?.company_name} (${agency?.agency_code})</li>
      <li>金額: ¥${sale.total_amount.toLocaleString()}</li>
      <li>顧客: ${sale.customer_name}</li>
      <li>売上日: ${sale.sale_date}</li>
    </ul>

    <h3>検知内容</h3>
    <ul>
      <li>異常スコア: ${anomalyResult.anomaly_score}/100</li>
      <li>検知理由:</li>
      <ul>
        ${anomalyResult.reasons.map(reason => `<li>${reason}</li>`).join('')}
      </ul>
    </ul>

    <h3>詳細</h3>
    ${anomalyResult.details.spike.detected ? `
      <h4>売上スパイク</h4>
      <ul>
        <li>今月売上: ¥${anomalyResult.details.spike.current_total.toLocaleString()}</li>
        <li>前月売上: ¥${anomalyResult.details.spike.previous_total.toLocaleString()}</li>
        <li>成長率: ${anomalyResult.details.spike.growth_rate?.toFixed(1)}%</li>
      </ul>
    ` : ''}

    ${anomalyResult.details.rapid_entry.detected ? `
      <h4>大量登録</h4>
      <ul>
        <li>${anomalyResult.details.rapid_entry.time_window_hours}時間以内の登録数: ${anomalyResult.details.rapid_entry.count}件</li>
        <li>閾値: ${anomalyResult.details.rapid_entry.threshold}件</li>
      </ul>
    ` : ''}

    ${anomalyResult.details.abnormal_amount.detected ? `
      <h4>異常金額</h4>
      <ul>
        <li>売上金額: ¥${anomalyResult.details.abnormal_amount.amount.toLocaleString()}</li>
        <li>過去平均: ¥${anomalyResult.details.abnormal_amount.average?.toLocaleString()}</li>
        <li>統計的異常度: ${anomalyResult.details.abnormal_amount.z_score?.toFixed(2)}σ</li>
      </ul>
    ` : ''}

    <p><a href="${process.env.FRONTEND_URL}/sales/${sale.id}">売上詳細を確認</a></p>
  `;

  // 各管理者にメール送信
  for (const admin of admins) {
    await emailService.sendEmail({
      to: admin.email,
      subject: `【要確認】売上異常検知: ${sale.sale_number}`,
      html: emailContent
    });
  }

  // システム通知も作成
  await supabase
    .from('notifications')
    .insert({
      type: 'anomaly_detection',
      title: '売上異常検知',
      content: `売上番号 ${sale.sale_number} で異常を検知しました`,
      data: {
        sale_id: sale.id,
        anomaly_result: anomalyResult
      },
      priority: 'high',
      target_roles: ['admin', 'super_admin']
    });
}

/**
 * GET /api/sales/anomalies
 * 異常検知された売上一覧取得（管理者のみ）
 */
router.get('/anomalies', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    const { reviewed = 'false', start_date, end_date } = req.query;

    let query = supabase
      .from('sales')
      .select(`
        *,
        agency:agencies!inner(id, company_name, agency_code),
        product:products(id, name, price)
      `)
      .eq('anomaly_detected', true)
      .order('anomaly_score', { ascending: false });

    // レビュー状態でフィルタ
    if (reviewed === 'false') {
      query = query.eq('requires_review', true);
    }

    // 日付範囲フィルタ
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      summary: {
        total_anomalies: data?.length || 0,
        pending_review: data?.filter(s => s.requires_review).length || 0,
        high_score_count: data?.filter(s => s.anomaly_score >= 70).length || 0
      }
    });
  } catch (error) {
    console.error('Get anomaly sales error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/sales/:id/review
 * 異常検知された売上のレビューを完了（管理者のみ）
 */
router.put('/:id/review', authenticateToken, async (req, res) => {
  try {
    // 管理者権限チェック
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '権限がありません'
      });
    }

    const { id } = req.params;
    const { review_status, review_notes } = req.body;

    // review_status のバリデーション
    const validReviewStatuses = ['reviewed', 'approved', 'rejected'];
    if (review_status && !validReviewStatuses.includes(review_status)) {
      return res.status(400).json({
        success: false,
        message: `review_statusが無効です。有効な値: ${validReviewStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from('sales')
      .update({
        requires_review: false,
        review_status: review_status || 'reviewed',
        review_notes: review_notes || null,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'レビューが完了しました',
      data
    });
  } catch (error) {
    console.error('Review sale error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

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
      // 下位代理店のIDを再帰的に取得
      const getSubordinateAgencyIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children && children.length > 0) {
          for (const child of children) {
            const childIds = await getSubordinateAgencyIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

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
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * GET /api/sales/export
 * 売上データをCSVでエクスポート
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, agency_id } = req.query;

    // 売上データを取得（外部結合なし）
    let query = supabase
      .from('sales')
      .select('*')
      .order('sale_date', { ascending: false });

    // 期間フィルタ
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }

    // 代理店フィルタ（代理店ユーザーは自分のデータのみ、管理者は全データ）
    // 管理者以外の場合のみ代理店フィルタを適用
    if (req.user.role !== 'admin') {
      if (agency_id || req.user.agency?.id) {
        query = query.eq('agency_id', agency_id || req.user.agency?.id);
      }
    } else if (agency_id) {
      // 管理者が特定の代理店を指定した場合のみフィルタ
      query = query.eq('agency_id', agency_id);
    }

    const { data: sales, error } = await query;

    if (error) throw error;

    // 代理店情報を取得
    const agencyIds = [...new Set(sales.map(s => s.agency_id).filter(id => id))];
    const agencyMap = {};

    if (agencyIds.length > 0) {
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, company_name, agency_code')
        .in('id', agencyIds);

      if (agencies) {
        agencies.forEach(a => {
          agencyMap[a.id] = a;
        });
      }
    }

    // 商品情報を取得
    const productIds = [...new Set(sales.map(s => s.product_id).filter(id => id))];
    const productMap = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      if (products) {
        products.forEach(p => {
          productMap[p.id] = p;
        });
      }
    }

    // CSV用にデータを整形
    const csvData = sales.map(sale => ({
      売上番号: sale.sale_number,
      売上日: sale.sale_date,
      代理店コード: agencyMap[sale.agency_id]?.agency_code || '',
      代理店名: agencyMap[sale.agency_id]?.company_name || '',
      商品名: productMap[sale.product_id]?.name || '',
      数量: sale.quantity,
      売上金額: sale.total_amount,
      状態: sale.status === 'confirmed' ? '確定' : '仮登録'
    }));

    // CSVに変換
    const json2csvParser = new Parser({
      fields: ['売上番号', '売上日', '代理店コード', '代理店名', '商品名', '数量', '売上金額', '状態'],
      withBOM: true
    });
    const csv = json2csvParser.parse(csvData);

    // ファイル名を生成
    const filename = `sales_${new Date().toISOString().split('T')[0]}.csv`;

    // CSVをダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export sales error details:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    res.status(500).json({
      error: true,
      message: '売上データのエクスポートに失敗しました'
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
      // 下位代理店のIDを再帰的に取得
      const getSubordinateAgencyIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children && children.length > 0) {
          for (const child of children) {
            const childIds = await getSubordinateAgencyIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

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
      error: error.message
    });
  }
});

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
          error: true,
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
          error: true,
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
          error: true,
          message: '商品が見つかりません'
        });
      }

      const total_amount = product.price * quantity;

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
          console.error('異常フラグ更新エラー:', updateError);
        }

        // 管理者に通知を送信
        try {
          await sendAnomalyNotification(data, anomalyResult);
        } catch (notifyError) {
          console.error('異常通知送信エラー:', notifyError);
        }
      }

      // 報酬を自動計算して登録
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

          const settings = commissionSettings || {
            tier1_from_tier2_bonus: 2.00,
            tier2_from_tier3_bonus: 1.50,
            tier3_from_tier4_bonus: 1.00,
            minimum_payment_amount: 10000,
            withholding_tax_rate: 10.21,
            non_invoice_deduction_rate: 2.00
          };

          // 報酬を計算（キャンペーンも考慮、売上登録時の設定値を適用）
          const commissionResult = calculateCommissionForSale(data, agencyData, product, parentChain, settings);

          // 報酬レコードを作成
          const month = new Date(sale_date).toISOString().slice(0, 7); // YYYY-MM形式

          // 計算詳細に設定値を保存（編集時に使用）
          const calculationDetails = {
            ...(commissionResult.calculation_details || {}),
            applied_settings: {
              tier1_from_tier2_bonus: settings.tier1_from_tier2_bonus,
              tier2_from_tier3_bonus: settings.tier2_from_tier3_bonus,
              tier3_from_tier4_bonus: settings.tier3_from_tier4_bonus,
              minimum_payment_amount: settings.minimum_payment_amount,
              withholding_tax_rate: settings.withholding_tax_rate,
              non_invoice_deduction_rate: settings.non_invoice_deduction_rate
            }
          };

          const { error: commissionError } = await supabase
            .from('commissions')
            .insert({
              sale_id: data.id,
              agency_id: agency_id,
              month: month,
              base_amount: commissionResult.base_amount,
              tier_bonus: commissionResult.tier_bonus || 0,
              campaign_bonus: commissionResult.campaign_bonus || 0,
              withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
              final_amount: commissionResult.final_amount,
              status: 'confirmed',  // 自動計算時は確定済みとする
              tier_level: agencyData.tier_level,  // tier_levelを追加
              calculation_details: calculationDetails
            });

          if (commissionError) {
            console.error('Commission creation error:', commissionError);
            // エラーをログに記録するが、売上登録自体は成功させる
          }

          // 親代理店の階層ボーナスも登録
          if (commissionResult.parent_commissions && commissionResult.parent_commissions.length > 0) {
            for (const parentCommission of commissionResult.parent_commissions) {
              const { error: parentCommError } = await supabase
                .from('commissions')
                .insert({
                  sale_id: data.id,
                  agency_id: parentCommission.agency_id,
                  month: month,
                  base_amount: 0,
                  tier_bonus: parentCommission.amount,
                  campaign_bonus: 0,
                  withholding_tax: 0,  // 階層ボーナスに源泉徴収はなし
                  final_amount: parentCommission.amount,
                  status: 'confirmed',  // 自動計算時は確定済みとする
                  tier_level: parentCommission.tier_level,  // 親代理店のtier_levelを追加
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

              if (parentCommError) {
                console.error('Parent commission creation error:', parentCommError);
              }
            }
          }
        }
      } catch (commissionCalcError) {
        console.error('Commission calculation error:', commissionCalcError);
        // 報酬計算エラーがあっても売上登録は成功させる
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
        console.error('Sales notification email error:', emailError);
      }

      res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Create sale error:', error);
      res.status(500).json({
        error: true,
        message: 'データの作成に失敗しました'
      });
    }
  }
);

/**
 * GET /api/sales/summary
 * 売上サマリー取得
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let startDate = new Date();
    if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    let query = supabase
      .from('sales')
      .select('total_amount, sale_date, status')
      .gte('sale_date', startDate.toISOString())
      .eq('status', 'confirmed');

    if (req.user.role === 'agency' && req.user.agency) {
      query = query.eq('agency_id', req.user.agency.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 集計
    const summary = {
      total_sales: data.reduce((sum, sale) => sum + sale.total_amount, 0),
      total_count: data.length,
      average_sale: data.length > 0 ? data.reduce((sum, sale) => sum + sale.total_amount, 0) / data.length : 0,
      period_start: startDate.toISOString(),
      period_end: new Date().toISOString()
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

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
      return res.status(400).json({ error: true, message: '数量は1以上の数値で指定してください' });
    }
    if (unit_price !== undefined && (typeof unit_price !== 'number' || unit_price < 0)) {
      return res.status(400).json({ error: true, message: '単価は0以上の数値で指定してください' });
    }
    if (status !== undefined) {
      const validStatuses = ['pending', 'confirmed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: true, message: `ステータスが無効です。有効な値: ${validStatuses.join(', ')}` });
      }
    }
    if (sale_date !== undefined && isNaN(Date.parse(sale_date))) {
      return res.status(400).json({ error: true, message: '売上日の形式が無効です' });
    }

    // 売上情報を取得
    const { data: currentSale, error: fetchError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentSale) {
      return res.status(404).json({
        error: true,
        message: '売上情報が見つかりません'
      });
    }

    // ステータスベースの権限チェック
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const isAgency = req.user.role === 'agency';

    // 代理店は自社の売上のみ編集可能
    if (isAgency && currentSale.agency_id !== req.user.agency?.id) {
      return res.status(403).json({
        error: true,
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
          error: true,
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
          error: true,
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
        error: true,
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
          console.error('変更履歴の保存エラー:', historyError);
          // 履歴保存エラーは売上更新の成功には影響しない
        }
      } catch (historyError) {
        console.error('変更履歴の保存エラー:', historyError);
      }
    }

    // 金額が変更された場合、関連する報酬を再計算
    if (quantity !== undefined || unit_price !== undefined) {
      try {
        // 売上に紐づく報酬レコードを取得
        const { data: relatedCommissions, error: commError } = await supabase
          .from('commissions')
          .select('*')
          .eq('sale_id', id);

        if (!commError) {
          // 代理店情報取得
          const { data: agency, error: agencyError } = await supabase
            .from('agencies')
            .select('*')
            .eq('id', data.agency_id)
            .single();

          // 商品情報取得
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', data.product_id)
            .single();

          if (agency && product) {
            // 親代理店チェーン取得
            let parentChain = [];
            let currentParentId = agency.parent_agency_id;
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

            // 報酬が存在する場合：更新処理
            if (relatedCommissions && relatedCommissions.length > 0) {
              // 登録時の設定値を取得（編集時は設定値を変更しない）
              let settings = null;

              // 既存の報酬レコードから登録時の設定値を取得
              if (relatedCommissions[0].calculation_details?.applied_settings) {
                settings = relatedCommissions[0].calculation_details.applied_settings;
                // 登録時の設定値を使用
              } else {
                // フォールバック: 設定値が保存されていない場合はデフォルト値
                settings = {
                  tier1_from_tier2_bonus: 2.00,
                  tier2_from_tier3_bonus: 1.50,
                  tier3_from_tier4_bonus: 1.00,
                  minimum_payment_amount: 10000,
                  withholding_tax_rate: 10.21,
                  non_invoice_deduction_rate: 2.00
                };
                // デフォルト設定値を使用
              }

              // 報酬を再計算（登録時の設定値を使用）
              const commissionResult = calculateCommissionForSale(data, agency, product, parentChain, settings);

              // 各報酬レコードを更新
              for (const commission of relatedCommissions) {
                if (commission.base_amount > 0) {
                  // 基本報酬レコード
                  const month = new Date(data.sale_date).toISOString().slice(0, 7);
                  await supabase
                    .from('commissions')
                    .update({
                      month: month,
                      base_amount: commissionResult.base_amount,
                      tier_bonus: 0,
                      campaign_bonus: 0,
                      withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
                      final_amount: commissionResult.final_amount,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', commission.id);
                } else if (commission.tier_bonus > 0) {
                  // 階層ボーナスレコード
                  const parentComm = commissionResult.parent_commissions?.find(
                    pc => pc.agency_id === commission.agency_id
                  );
                  if (parentComm) {
                    const month = new Date(data.sale_date).toISOString().slice(0, 7);
                    await supabase
                      .from('commissions')
                      .update({
                        month: month,
                        tier_bonus: parentComm.amount,
                        final_amount: parentComm.amount,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', commission.id);
                  }
                }
              }
            } else {
              // 報酬が存在しない場合：新規作成処理
              // 報酬が存在しないため新規作成

              // 現在の設定値を取得
              const { data: commissionSettings } = await supabase
                .from('commission_settings')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

              const settings = commissionSettings || {
                tier1_from_tier2_bonus: 2.00,
                tier2_from_tier3_bonus: 1.50,
                tier3_from_tier4_bonus: 1.00,
                minimum_payment_amount: 10000,
                withholding_tax_rate: 10.21,
                non_invoice_deduction_rate: 2.00
              };

              // 報酬を計算
              const commissionResult = calculateCommissionForSale(data, agency, product, parentChain, settings);

              // 報酬レコードを作成
              const month = new Date(data.sale_date).toISOString().slice(0, 7);

              // 計算詳細に設定値を保存
              const calculationDetails = {
                ...(commissionResult.calculation_details || {}),
                applied_settings: {
                  tier1_from_tier2_bonus: settings.tier1_from_tier2_bonus,
                  tier2_from_tier3_bonus: settings.tier2_from_tier3_bonus,
                  tier3_from_tier4_bonus: settings.tier3_from_tier4_bonus,
                  minimum_payment_amount: settings.minimum_payment_amount,
                  withholding_tax_rate: settings.withholding_tax_rate,
                  non_invoice_deduction_rate: settings.non_invoice_deduction_rate
                }
              };

              // 基本報酬を作成
              await supabase
                .from('commissions')
                .insert({
                  sale_id: data.id,
                  agency_id: data.agency_id,
                  month: month,
                  base_amount: commissionResult.base_amount,
                  tier_bonus: commissionResult.tier_bonus || 0,
                  campaign_bonus: commissionResult.campaign_bonus || 0,
                  withholding_tax: commissionResult.calculation_details?.withholding_tax || 0,
                  final_amount: commissionResult.final_amount,
                  status: 'confirmed',
                  tier_level: agency.tier_level,
                  calculation_details: calculationDetails
                });

              // 親代理店の階層ボーナスも作成
              if (commissionResult.parent_commissions && commissionResult.parent_commissions.length > 0) {
                for (const parentCommission of commissionResult.parent_commissions) {
                  await supabase
                    .from('commissions')
                    .insert({
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
                        from_agency_id: data.agency_id,
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
            }
          }
        }
      } catch (commissionUpdateError) {
        console.error('報酬再計算エラー:', commissionUpdateError);
        // 報酬更新エラーがあっても売上更新は成功とする
      }
    }

    res.json({
      success: true,
      message: '売上情報を更新しました',
      data
    });
  } catch (error) {
    console.error('Update sale error:', error);
    res.status(500).json({
      error: true,
      message: 'データの更新に失敗しました'
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
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: true,
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
      console.log('Notification history deletion skipped:', notificationError.message);
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
    console.error('Delete sale error:', error);
    res.status(500).json({
      error: true,
      message: 'データの削除に失敗しました'
    });
  }
});

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
      // 下位代理店のIDを再帰的に取得
      const getSubordinateAgencyIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children && children.length > 0) {
          for (const child of children) {
            const childIds = await getSubordinateAgencyIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

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

/**
 * GET /api/sales/organization-summary
 * 組織全体の売上サマリー取得（自社＋傘下）
 */
router.get('/organization-summary', authenticateToken, async (req, res) => {
  try {
    // 管理者は全体を見れる
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      // 全代理店の売上を取得
      const { data: allSales, error: salesError } = await supabase
        .from('sales')
        .select('*, agencies!inner(company_name, tier_level)')
        .eq('status', 'confirmed')
        .gte('sale_date', new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString());

      if (salesError) throw salesError;

      const totalAmount = allSales.reduce((sum, sale) => sum + sale.total_amount, 0);

      res.json({
        success: true,
        data: {
          total_amount: totalAmount,
          own_amount: 0,
          subordinate_amount: totalAmount,
          sale_count: allSales.length,
          top_agencies: [] // 管理者向けは後で実装
        }
      });
      return;
    }

    // 代理店ユーザーの場合
    if (!req.user.agency || !req.user.agency.id) {
      return res.status(400).json({
        error: true,
        message: '代理店情報が見つかりません'
      });
    }

    const agencyId = req.user.agency.id;

    // 1. 傘下の代理店IDを全て取得する再帰関数
    const getSubordinateAgencyIds = async (parentId) => {
      const { data: children } = await supabase
        .from('agencies')
        .select('id')
        .eq('parent_agency_id', parentId);

      if (!children || children.length === 0) {
        return [];
      }

      let allIds = children.map(c => c.id);

      // 各子代理店の傘下も再帰的に取得
      for (const child of children) {
        const grandChildren = await getSubordinateAgencyIds(child.id);
        allIds = allIds.concat(grandChildren);
      }

      return allIds;
    };

    // 傘下の代理店IDリストを取得
    const subordinateIds = await getSubordinateAgencyIds(agencyId);
    const allAgencyIds = [agencyId, ...subordinateIds];

    // 2. 期間設定（直近30日）
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // 3. 売上データ取得
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('*, agencies!inner(id, company_name, tier_level)')
      .in('agency_id', allAgencyIds)
      .eq('status', 'confirmed')
      .gte('sale_date', startDate.toISOString())
      .order('sale_date', { ascending: false });

    if (salesError) throw salesError;

    // 4. 集計
    const ownSales = salesData.filter(s => s.agency_id === agencyId);
    const subordinateSales = salesData.filter(s => s.agency_id !== agencyId);

    const ownAmount = ownSales.reduce((sum, sale) => sum + sale.total_amount, 0);
    const subordinateAmount = subordinateSales.reduce((sum, sale) => sum + sale.total_amount, 0);

    // 5. TOP代理店の計算（傘下のみ）
    const agencySalesMap = {};
    subordinateSales.forEach(sale => {
      if (!agencySalesMap[sale.agency_id]) {
        agencySalesMap[sale.agency_id] = {
          agency_id: sale.agency_id,
          agency_name: sale.agencies.company_name,
          total_amount: 0,
          sale_count: 0
        };
      }
      agencySalesMap[sale.agency_id].total_amount += sale.total_amount;
      agencySalesMap[sale.agency_id].sale_count += 1;
    });

    const topAgencies = Object.values(agencySalesMap)
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 5); // TOP5

    res.json({
      success: true,
      data: {
        total_amount: ownAmount + subordinateAmount,
        own_amount: ownAmount,
        subordinate_amount: subordinateAmount,
        sale_count: salesData.length,
        own_sale_count: ownSales.length,
        subordinate_sale_count: subordinateSales.length,
        top_agencies: topAgencies,
        period_start: startDate.toISOString(),
        period_end: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get organization summary error:', error);
    res.status(500).json({
      error: true,
      message: '組織売上サマリーの取得に失敗しました'
    });
  }
});

module.exports = router;