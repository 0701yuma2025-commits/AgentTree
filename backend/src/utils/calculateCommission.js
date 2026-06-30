/**
 * 報酬計算ユーティリティ
 * 商品マスタのTier別報酬率と階層ボーナスを適用した計算を行う
 */

/**
 * デフォルトのTier別報酬率（%）
 * 商品マスタに設定がない場合のフォールバック
 */
const DEFAULT_TIER_RATES = {
  1: 10.00,
  2: 8.00,
  3: 6.00,
  4: 4.00,
  5: 2.00
};

/**
 * デフォルトの階層ボーナス率（%）
 * 上位階層の代理店が下位代理店の売上から獲得する追加報酬
 * commissionSettingsで設定がある場合はそちらを優先
 */
const DEFAULT_HIERARCHY_BONUS_RATES = {
  1: 2.0,  // Tier1がTier2の売上から得る
  2: 1.5,  // Tier2がTier3の売上から得る
  3: 1.0,  // Tier3がTier4の売上から得る
  4: 0.5,  // Tier4がTier5の売上から得る
  5: 0     // Tier5は階層ボーナスなし（最下層）
};

/**
 * デフォルトの報酬設定値
 * commission_settingsテーブルにレコードがない場合のフォールバック
 */
const DEFAULT_COMMISSION_SETTINGS = {
  tier1_from_tier2_bonus: DEFAULT_HIERARCHY_BONUS_RATES[1],
  tier2_from_tier3_bonus: DEFAULT_HIERARCHY_BONUS_RATES[2],
  tier3_from_tier4_bonus: DEFAULT_HIERARCHY_BONUS_RATES[3],
  tier4_from_tier5_bonus: DEFAULT_HIERARCHY_BONUS_RATES[4],
  minimum_payment_amount: 10000,
  withholding_tax_rate: 10.21,
  // 源泉徴収: 1回(月次)の支払が100万円を超える部分は20.42%(設定で変更可)
  withholding_threshold: 1000000,
  withholding_threshold_rate: 20.42,
  // 外交員報酬の月額控除(1か月あたり12万円)。月次集計時に適用
  withholding_monthly_deduction: 120000,
  // インボイス未登録控除率: 2026/9まで2%、2026/10〜は経過措置見直しで要設定(税制改正大綱では3%見込)
  non_invoice_deduction_rate: 2.00
};

/**
 * 源泉徴収税額を計算（累進対応・設定可能）。
 * 100万円までは withholding_tax_rate(既定10.21%)、超える部分は withholding_threshold_rate(既定20.42%)。
 * 外交員の月12万円控除は、月次集計側で taxableAmount に反映してから渡すこと（この関数では引かない）。
 * @param {number} taxableAmount - 源泉対象額（控除後）
 * @param {object} settings - commission_settings
 * @returns {number} 源泉徴収税額（円・切り捨て）
 */
function calculateWithholdingTax(taxableAmount, settings = {}) {
  const amount = Math.max(0, taxableAmount || 0);
  const rate = settings.withholding_tax_rate ?? 10.21;
  const threshold = settings.withholding_threshold ?? 1000000;
  const thresholdRate = settings.withholding_threshold_rate ?? 20.42;
  if (amount <= threshold) {
    return Math.floor(amount * rate / 100);
  }
  return Math.floor((threshold * rate / 100) + ((amount - threshold) * thresholdRate / 100));
}

/**
 * 売上に基づく報酬を計算（商品情報を考慮）
 * @param {Object} sale - 売上データ
 * @param {Object} agency - 代理店データ
 * @param {Object} product - 商品データ（Tier別報酬率を含む）
 * @param {Array} parentChain - 親代理店チェーン（上位階層すべて）
 * @param {Object} commissionSettings - 報酬設定（インボイス控除率を含む）
 * @returns {Object} 計算結果
 */
function calculateCommissionForSale(sale, agency, product = null, parentChain = [], commissionSettings = null) {
  const result = {
    agency_id: agency.id,
    sale_id: sale.id,
    tier_level: agency.tier_level,
    base_amount: 0,
    tier_bonus: 0,
    campaign_bonus: 0,
    invoice_deduction: 0,  // インボイス控除額を追加
    final_amount: 0,
    parent_commissions: [],
    calculation_details: {}
  };

  // 商品のTier別報酬率を取得（なければデフォルト）
  let commissionRate = DEFAULT_TIER_RATES[agency.tier_level] || 4.00;

  if (product) {
    // 商品マスタからTier別の報酬率を取得
    const tierRateField = `tier${agency.tier_level}_commission_rate`;
    if (product[tierRateField] !== null && product[tierRateField] !== undefined) {
      // 非数値文字列だとparseFloatがNaN→base_amountがNaN化しfinalまで伝播するためガード(G10)。
      // NaN時はデフォルト料率を維持する。
      const parsedRate = parseFloat(product[tierRateField]);
      if (!Number.isNaN(parsedRate)) {
        commissionRate = parsedRate;
      }
    }
  }

  // 基本報酬の計算
  result.base_amount = Math.floor(sale.total_amount * commissionRate / 100);
  result.calculation_details.commission_rate = commissionRate;
  result.calculation_details.sale_amount = sale.total_amount;

  // 階層ボーナスの計算（親代理店への還元）
  if (parentChain && parentChain.length > 0) {
    parentChain.forEach(parentAgency => {
      if (parentAgency.tier_level < agency.tier_level) {
        const tierDifference = agency.tier_level - parentAgency.tier_level;

        // 設定から階層ボーナス率を取得（なければデフォルト）
        let bonusRate = DEFAULT_HIERARCHY_BONUS_RATES[parentAgency.tier_level] || 0;
        if (commissionSettings) {
          if (parentAgency.tier_level === 1 && commissionSettings.tier1_from_tier2_bonus !== undefined) {
            bonusRate = parseFloat(commissionSettings.tier1_from_tier2_bonus);
          } else if (parentAgency.tier_level === 2 && commissionSettings.tier2_from_tier3_bonus !== undefined) {
            bonusRate = parseFloat(commissionSettings.tier2_from_tier3_bonus);
          } else if (parentAgency.tier_level === 3 && commissionSettings.tier3_from_tier4_bonus !== undefined) {
            bonusRate = parseFloat(commissionSettings.tier3_from_tier4_bonus);
          } else if (parentAgency.tier_level === 4 && commissionSettings.tier4_from_tier5_bonus !== undefined) {
            bonusRate = parseFloat(commissionSettings.tier4_from_tier5_bonus);
          }
        }

        if (bonusRate > 0) {
          const bonusAmount = Math.floor(sale.total_amount * bonusRate / 100);

          result.parent_commissions.push({
            agency_id: parentAgency.id,
            agency_name: parentAgency.company_name,
            tier_level: parentAgency.tier_level,
            amount: bonusAmount,
            tier_difference: tierDifference,
            bonus_rate: bonusRate
          });

          // 階層ボーナス合計を加算
          result.tier_bonus += bonusAmount;
        }
      }
    });
  }

  // インボイス控除の計算（インボイス未登録事業者の場合）
  let invoice_deduction = 0;
  if (!agency.invoice_registered) {
    // インボイス未登録の場合、設定された控除率を適用（デフォルト2%）
    // ?? で 0%設定(控除なし)を尊重する(|| だと0がデフォルト2.0に化ける=G8)
    const deductionRate = commissionSettings?.non_invoice_deduction_rate ?? 2.0;
    invoice_deduction = Math.floor(result.base_amount * deductionRate / 100);
    result.invoice_deduction = invoice_deduction;
    result.calculation_details.invoice_deduction = invoice_deduction;
    result.calculation_details.invoice_deduction_rate = deductionRate;
    result.calculation_details.invoice_registered = false;
  } else {
    result.calculation_details.invoice_registered = true;
  }

  // 源泉徴収の計算（個人事業主の場合）。ここは売上単位の暫定値で、
  // 外交員の月12万円控除・月次合算・100万円超の累進確定は月次計算側で行う。
  let withholding_tax = 0;
  if (agency.company_type === '個人' || agency.withholding_tax_flag) {
    // インボイス控除後の金額に累進対応の共通関数を適用(率は設定値・0%も尊重=G8)
    const taxableAmount = result.base_amount - invoice_deduction;
    withholding_tax = calculateWithholdingTax(taxableAmount, commissionSettings || {});
    result.calculation_details.withholding_tax = withholding_tax;
    result.calculation_details.withholding_rate = commissionSettings?.withholding_tax_rate ?? 10.21;
  }

  // 最終金額（基本報酬 - インボイス控除 - 源泉徴収）。
  // 料率の誤設定(控除＋源泉が100%超)でも負値にならないよう下限0でクランプ(G9)。
  result.final_amount = Math.max(0, result.base_amount - invoice_deduction - withholding_tax);
  result.calculation_details.before_tax = result.base_amount;
  result.calculation_details.after_tax = result.final_amount;

  return result;
}

/**
 * 月次報酬を一括計算
 * @param {Array} sales - 売上リスト
 * @param {Array} agencies - 代理店リスト
 * @param {Array} products - 商品リスト
 * @param {String} month - 対象月 (YYYY-MM)
 * @param {Object} commissionSettings - 報酬設定（インボイス控除率を含む）
 * @returns {Array} 報酬計算結果リスト
 */
function calculateMonthlyCommissions(sales, agencies, products, month, commissionSettings = null, campaigns = []) {
  const commissions = [];

  // マップ化
  const agencyMap = {};
  agencies.forEach(agency => {
    agencyMap[agency.id] = agency;
  });

  const productMap = {};
  if (products && products.length > 0) {
    products.forEach(product => {
      productMap[product.id] = product;
    });
  }

  // 代理店の親子関係を構築
  const getParentChain = (agencyId) => {
    const chain = [];
    let currentId = agencyId;
    let depth = 0;

    while (currentId && depth < 10) { // 無限ループ防止
      const agency = agencyMap[currentId];
      if (!agency || !agency.parent_agency_id) break;

      const parent = agencyMap[agency.parent_agency_id];
      if (parent) {
        chain.push(parent);
        currentId = parent.id;
      } else {
        break;
      }
      depth++;
    }

    return chain;
  };

  // キャンペーンはcampaignsテーブル連動(新方式)に一本化(シナリオC)。売上単位で適用する。
  const normalizedCampaigns = normalizeCampaigns(campaigns);

  // 売上ごとに報酬レコードを作成（sale_idを保持）
  sales.forEach(sale => {
    const agency = agencyMap[sale.agency_id];
    if (!agency) return;

    const product = productMap[sale.product_id] || null;
    const parentChain = getParentChain(agency.id);

    // 売上ごとの設定値を使用（_applied_settingsがあればそれを優先）
    const saleSettings = sale._applied_settings || commissionSettings;

    const commission = calculateCommissionForSale(sale, agency, product, parentChain, saleSettings);

    // キャンペーンボーナス（新方式・売上単位）。旧 calculateCampaignBonus(閾値直書き)は廃止(シナリオC)。
    const campaignResult = calculateCampaignBonusNew(sale, agency, product, normalizedCampaigns);
    const campaignBonus = campaignResult.total || 0;

    // 売上を登録した代理店の報酬レコード（1売上 = 1報酬レコード）
    const commissionRecord = {
      agency_id: agency.id,
      sale_id: sale.id,
      month: month,
      base_amount: commission.base_amount,
      tier_bonus: 0,
      campaign_bonus: campaignBonus,
      invoice_deduction: commission.invoice_deduction || 0,
      final_amount: commission.final_amount + campaignBonus,
      status: 'confirmed',
      tier_level: agency.tier_level,
      withholding_tax: commission.calculation_details.withholding_tax || 0,
      calculation_details: {
        ...commission.calculation_details,
        applied_settings: sale._applied_settings || null,
        campaign_details: campaignResult.details
      },
      // メタデータ（表示用、DB保存時に除外）
      agency_name: agency.company_name,
      company_type: agency.company_type,
      sale_number: sale.sale_number,
      product_name: product ? product.name : '不明',
      sale_amount: sale.total_amount
    };

    commissions.push(commissionRecord);

    // 親代理店の階層ボーナスレコードを作成
    commission.parent_commissions.forEach(parentComm => {
      const parentAgency = agencyMap[parentComm.agency_id];
      if (!parentAgency) return;

      const parentBonusRecord = {
        agency_id: parentComm.agency_id,
        sale_id: sale.id,  // 売上との紐付けを保持
        month: month,
        base_amount: 0,  // 階層ボーナスなので基本報酬は0
        tier_bonus: parentComm.amount,
        campaign_bonus: 0,
        final_amount: parentComm.amount,
        status: 'confirmed',  // 計算時点で確定
        tier_level: parentAgency.tier_level,
        withholding_tax: 0,
        // メタデータ（表示用）
        agency_name: parentAgency.company_name,
        company_type: parentAgency.company_type,
        sale_number: sale.sale_number,
        product_name: product ? product.name : '不明',
        sale_amount: sale.total_amount,
        hierarchy_bonus_from: agency.company_name
      };

      commissions.push(parentBonusRecord);
    });
  });

  // 源泉徴収(外交員報酬)を月次・代理店単位で確定する。
  // 個人事業主は「(その月の報酬合計 − インボイス控除 − 月12万円) に累進税率(100万円超は20.42%)」で
  // 源泉徴収。基本報酬だけでなく階層/キャンペーンボーナスも含めて課税。法人は源泉なし。
  // 売上単位の暫定源泉(calculateCommissionForSale)を上書きし、合計を代表レコードに集約する。
  const monthlyDeduction = commissionSettings?.withholding_monthly_deduction ?? 120000;
  const recordsByAgency = {};
  commissions.forEach(c => {
    (recordsByAgency[c.agency_id] = recordsByAgency[c.agency_id] || []).push(c);
  });

  Object.keys(recordsByAgency).forEach(agencyId => {
    const recs = recordsByAgency[agencyId];
    const agency = agencyMap[agencyId];
    const isIndividual = !!agency && (agency.company_type === '個人' || agency.withholding_tax_flag);

    // 各レコードの源泉を一旦0に戻し、final = 報酬 − インボイス控除 で再計算
    let monthlyReward = 0;
    let monthlyInvoiceDeduction = 0;
    recs.forEach(r => {
      const reward = (r.base_amount || 0) + (r.tier_bonus || 0) + (r.campaign_bonus || 0);
      const invDed = r.calculation_details?.invoice_deduction || 0;
      monthlyReward += reward;
      monthlyInvoiceDeduction += invDed;
      r.withholding_tax = 0;
      r.final_amount = reward - invDed;
    });

    if (isIndividual) {
      const taxable = monthlyReward - monthlyInvoiceDeduction - monthlyDeduction;
      const withholding = calculateWithholdingTax(taxable, commissionSettings || {});
      if (withholding > 0) {
        // 代表レコード(base>0優先、無ければ先頭)に源泉を集約
        const rep = recs.find(r => (r.base_amount || 0) > 0) || recs[0];
        rep.withholding_tax = withholding;
        rep.final_amount = Math.max(0, rep.final_amount - withholding);
        if (rep.calculation_details) {
          rep.calculation_details.withholding_tax = withholding;
          rep.calculation_details.monthly_withholding = true;
        }
      }
    }
  });

  // 最低支払額チェック（代理店ごとに集計）。キャンペーンは上の売上単位計算で適用済みのため
  // ここでは旧 calculateCampaignBonus(閾値直書きの二重カウント=バグB)は行わない(シナリオC)。
  const agencySummary = {};

  // 代理店ごとのfinal_amount合計を計算
  commissions.forEach(commission => {
    if (!agencySummary[commission.agency_id]) {
      agencySummary[commission.agency_id] = { total_amount: 0 };
    }
    agencySummary[commission.agency_id].total_amount += commission.final_amount;
  });

  // 最低支払額未満は繰り越しに変更
  Object.keys(agencySummary).forEach(agencyId => {
    const summary = agencySummary[agencyId];
    // ?? で 最低支払額0(繰り越しなし)を尊重する(G8)
    const MIN_PAYMENT_AMOUNT = commissionSettings?.minimum_payment_amount ?? 10000;

    if (summary.total_amount < MIN_PAYMENT_AMOUNT) {
      commissions.forEach(commission => {
        if (commission.agency_id === agencyId) {
          commission.status = 'carried_forward';
          commission.carry_forward_reason = `最低支払額(¥${MIN_PAYMENT_AMOUNT.toLocaleString()})未満`;
        }
      });
    }
  });

  return commissions;
}

/**
 * DB形式のキャンペーンを計算関数(calculateCampaignBonusNew)が期待する形式に正規化する。
 * 売上登録(mutations.js)と月次計算(calculateMonthlyCommissions)で同一ロジックを共有し、
 * 経路差(バグC)をなくすための共通ヘルパー。
 * @param {Array} campaigns - campaignsテーブルの生レコード配列
 * @returns {Array} 正規化済みキャンペーン配列
 */
function normalizeCampaigns(campaigns = []) {
  if (!Array.isArray(campaigns)) return [];
  return campaigns.map(c => ({
    ...c,
    // bonus_rate(率)があればpercentage、無ければbonus_amount(固定額)。null/undefined両対応。
    bonus_type: c.conditions?.bonus_type || (c.bonus_rate != null ? 'percentage' : 'fixed'),
    bonus_value: c.bonus_rate != null ? c.bonus_rate : c.bonus_amount,
    target_products: c.conditions?.target_products || null,
    target_agencies: c.conditions?.target_agencies || null,
    target_tiers: c.target_tier_levels || [1, 2, 3, 4, 5],
    max_bonus_per_agency: c.conditions?.max_bonus_per_agency || null
  }));
}

/**
 * キャンペーンボーナスの計算（新実装：期間管理対応）
 * @param {Object} sale - 売上データ
 * @param {Object} agency - 代理店データ
 * @param {Object} product - 商品データ
 * @param {Array} campaigns - 有効なキャンペーン配列
 * @returns {Object} キャンペーンボーナス詳細
 */
function calculateCampaignBonusNew(sale, agency, product, campaigns = []) {
  let totalBonus = 0;
  const appliedCampaigns = [];

  if (!campaigns || campaigns.length === 0) {
    return { total: 0, details: [] };
  }

  campaigns.forEach(campaign => {
    // キャンペーン適用条件をチェック
    if (!checkCampaignEligibility(sale, agency, product, campaign)) {
      return;
    }

    let bonusAmount = 0;

    // ボーナスタイプに応じて計算
    if (campaign.bonus_type === 'percentage') {
      // パーセンテージボーナス
      bonusAmount = Math.floor(sale.total_amount * campaign.bonus_value / 100);
    } else if (campaign.bonus_type === 'fixed') {
      // 固定額ボーナス
      bonusAmount = campaign.bonus_value;
    }

    // 最大ボーナス額の制限
    if (campaign.max_bonus_per_agency && bonusAmount > campaign.max_bonus_per_agency) {
      bonusAmount = campaign.max_bonus_per_agency;
    }

    if (bonusAmount > 0) {
      totalBonus += bonusAmount;
      appliedCampaigns.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        bonus_amount: bonusAmount,
        bonus_type: campaign.bonus_type,
        bonus_value: campaign.bonus_value
      });
    }
  });

  return {
    total: totalBonus,
    details: appliedCampaigns
  };
}

/**
 * キャンペーン適用条件をチェック
 */
function checkCampaignEligibility(sale, agency, product, campaign) {
  // 1. 期間チェック（売上日がキャンペーン期間内か）
  const saleDate = new Date(sale.sale_date);
  const startDate = new Date(campaign.start_date);
  const endDate = new Date(campaign.end_date);

  if (saleDate < startDate || saleDate > endDate) {
    return false;
  }

  // 2. 対象商品チェック
  if (campaign.target_products && campaign.target_products.length > 0) {
    if (!campaign.target_products.includes(sale.product_id)) {
      return false;
    }
  }

  // 3. 対象Tierチェック
  if (campaign.target_tiers && campaign.target_tiers.length > 0) {
    if (!campaign.target_tiers.includes(agency.tier_level)) {
      return false;
    }
  }

  // 4. 対象代理店チェック
  if (campaign.target_agencies && campaign.target_agencies.length > 0) {
    if (!campaign.target_agencies.includes(agency.id)) {
      return false;
    }
  }

  // 5. 追加条件チェック（最小売上額など）
  if (campaign.conditions) {
    if (campaign.conditions.min_amount && sale.total_amount < campaign.conditions.min_amount) {
      return false;
    }
    if (campaign.conditions.min_quantity && sale.quantity < campaign.conditions.min_quantity) {
      return false;
    }
  }

  return true;
}

/**
 * 売上目標達成ボーナスの計算（旧実装・閾値直書き）。
 * @deprecated シナリオCにより報酬計算パイプラインからは除外済み(月次・売上登録とも
 * calculateCampaignBonusNew/campaignsテーブルに一本化)。閾値・率がハードコードで設定不能、
 * 経路差・二重カウント(バグB)の原因だったため不使用。直接の単体テストのみが参照。
 * @param {Number} totalSales - 総売上額
 * @param {Number} tierLevel - 階層レベル
 * @returns {Number} キャンペーンボーナス額
 */
function calculateCampaignBonus(totalSales, tierLevel) {
  // 売上目標達成ボーナスの例
  const thresholds = {
    1: 5000000,  // Tier 1: 500万円
    2: 3000000,  // Tier 2: 300万円
    3: 2000000,  // Tier 3: 200万円
    4: 1000000   // Tier 4: 100万円
  };

  const bonusRates = {
    1: 0.05,  // Tier 1: 5%ボーナス
    2: 0.04,  // Tier 2: 4%ボーナス
    3: 0.03,  // Tier 3: 3%ボーナス
    4: 0.02   // Tier 4: 2%ボーナス
  };

  const threshold = thresholds[tierLevel] || 1000000;
  const bonusRate = bonusRates[tierLevel] || 0.02;

  if (totalSales >= threshold) {
    return Math.floor(totalSales * bonusRate);
  }

  // 段階的ボーナス（50%達成で半額ボーナス）
  if (totalSales >= threshold * 0.5) {
    return Math.floor(totalSales * bonusRate * 0.5);
  }

  return 0;
}

/**
 * 報酬サマリーの生成
 * @deprecated 本番コードからは未使用(テストのみ)。内部に既知バグあり: レコードのプロパティは
 * sale_amount だが commission.total_sales を参照するため total_sales が常に0、total_agencies が
 * 代理店数でなくレコード数になる。配線する場合は集計キーを修正してから使うこと。
 * @param {Array} commissions - 報酬リスト
 * @returns {Object} サマリー情報
 */
function generateCommissionSummary(commissions) {
  const summary = {
    total_agencies: 0,
    total_sales: 0,
    total_base_commission: 0,
    total_tier_bonus: 0,
    total_campaign_bonus: 0,
    total_withholding_tax: 0,
    total_final_amount: 0,
    total_payable: 0,
    total_carried_forward: 0,
    by_tier: {}
  };

  commissions.forEach(commission => {
    summary.total_agencies++;
    summary.total_sales += commission.total_sales || 0;
    summary.total_base_commission += commission.base_amount || 0;
    summary.total_tier_bonus += commission.tier_bonus || 0;
    summary.total_campaign_bonus += commission.campaign_bonus || 0;
    summary.total_withholding_tax += commission.withholding_tax || 0;
    summary.total_final_amount += commission.final_amount || 0;

    if (commission.status === 'carried_forward') {
      summary.total_carried_forward += commission.final_amount || 0;
    } else {
      summary.total_payable += commission.final_amount || 0;
    }

    // Tier別集計
    const tier = commission.tier_level;
    if (!summary.by_tier[tier]) {
      summary.by_tier[tier] = {
        count: 0,
        total_sales: 0,
        total_commission: 0
      };
    }
    summary.by_tier[tier].count++;
    summary.by_tier[tier].total_sales += commission.total_sales || 0;
    summary.by_tier[tier].total_commission += commission.final_amount || 0;
  });

  return summary;
}

module.exports = {
  calculateCommissionForSale,
  calculateMonthlyCommissions,
  calculateCampaignBonus,
  calculateCampaignBonusNew,
  calculateWithholdingTax,
  normalizeCampaigns,
  checkCampaignEligibility,
  generateCommissionSummary,
  DEFAULT_TIER_RATES,
  DEFAULT_HIERARCHY_BONUS_RATES,
  DEFAULT_COMMISSION_SETTINGS,
  // 後方互換性のためのエイリアス
  HIERARCHY_BONUS_RATES: DEFAULT_HIERARCHY_BONUS_RATES
};