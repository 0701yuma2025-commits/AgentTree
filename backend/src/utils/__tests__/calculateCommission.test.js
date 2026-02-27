/**
 * 報酬計算ユニットテスト
 *
 * 【修正済み】cron-scheduler.js の calculateMonthlyCommissions 呼び出しは
 * 5引数 (sales, agencies, products, targetMonth, commissionSettings) に修正済み。
 * 下記「cronバグ再現」テストは2引数呼び出し時の防御動作を確認するために残す。
 */

const {
  calculateCommissionForSale,
  calculateMonthlyCommissions,
  calculateCampaignBonus,
  generateCommissionSummary,
  DEFAULT_TIER_RATES,
  DEFAULT_HIERARCHY_BONUS_RATES,
} = require('../calculateCommission');

// ── ヘルパー: テストデータファクトリ ──────────────────────

function makeSale(overrides = {}) {
  return {
    id: 'sale-1',
    agency_id: 'ag-1',
    product_id: 'prod-1',
    total_amount: 100000,
    sale_number: 'S-001',
    sale_date: '2026-01-15',
    ...overrides,
  };
}

function makeAgency(overrides = {}) {
  return {
    id: 'ag-1',
    tier_level: 2,
    company_name: 'テスト代理店',
    company_type: '法人',
    invoice_registered: true,
    ...overrides,
  };
}

function makeProduct(overrides = {}) {
  return {
    id: 'prod-1',
    name: 'テスト商品',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════
// calculateCommissionForSale
// ══════════════════════════════════════════════════════════
describe('calculateCommissionForSale', () => {
  // ── 基本報酬 ──────────────────────────────────────────
  describe('基本報酬計算', () => {
    test('Tier2 デフォルト率 8% → base=8,000', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.base_amount).toBe(8000);
      expect(result.calculation_details.commission_rate).toBe(8.0);
    });

    test('Tier1 デフォルト率 10%', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 1 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.base_amount).toBe(10000);
    });

    test('Tier3 デフォルト率 6%', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 3 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.base_amount).toBe(6000);
    });

    test('Tier4 デフォルト率 4%', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 4 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.base_amount).toBe(4000);
    });

    test('未知のTier → フォールバック 4%', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 99 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.base_amount).toBe(4000);
    });

    test('商品別率 override: tier2_commission_rate=12 → base=12,000', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const product = makeProduct({ tier2_commission_rate: 12 });
      const result = calculateCommissionForSale(sale, agency, product);
      expect(result.base_amount).toBe(12000);
      expect(result.calculation_details.commission_rate).toBe(12);
    });

    test('商品率がnull → デフォルト率を使用', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const product = makeProduct({ tier2_commission_rate: null });
      const result = calculateCommissionForSale(sale, agency, product);
      expect(result.base_amount).toBe(8000);
    });

    test('Math.floor確認: ¥100,001 × 10% = 10,000 (not 10,000.1)', () => {
      const sale = makeSale({ total_amount: 100001 });
      const agency = makeAgency({ tier_level: 1 });
      const result = calculateCommissionForSale(sale, agency);
      // 100001 * 10 / 100 = 10000.1 → Math.floor → 10000
      expect(result.base_amount).toBe(10000);
    });

    test('sale_id, agency_id がresultに正しく設定される', () => {
      const sale = makeSale({ id: 'sale-X' });
      const agency = makeAgency({ id: 'ag-X', tier_level: 1 });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.sale_id).toBe('sale-X');
      expect(result.agency_id).toBe('ag-X');
      expect(result.tier_level).toBe(1);
    });
  });

  // ── 階層ボーナス ──────────────────────────────────────
  describe('階層ボーナス（親代理店）', () => {
    test('親ボーナス Tier1←Tier2: デフォルト2% → amount=2,000', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const parent = makeAgency({ id: 'ag-parent', tier_level: 1, company_name: '親代理店' });
      const result = calculateCommissionForSale(sale, agency, null, [parent]);

      expect(result.parent_commissions).toHaveLength(1);
      expect(result.parent_commissions[0].agency_id).toBe('ag-parent');
      expect(result.parent_commissions[0].amount).toBe(2000);
      expect(result.parent_commissions[0].tier_difference).toBe(1);
      expect(result.tier_bonus).toBe(2000);
    });

    test('設定値ボーナス率 override: tier1_from_tier2_bonus=3.0 → amount=3,000', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const parent = makeAgency({ id: 'ag-parent', tier_level: 1 });
      const settings = { tier1_from_tier2_bonus: 3.0 };
      const result = calculateCommissionForSale(sale, agency, null, [parent], settings);

      expect(result.parent_commissions[0].amount).toBe(3000);
      expect(result.parent_commissions[0].bonus_rate).toBe(3.0);
    });

    test('Tier2←Tier3 ボーナス: tier2_from_tier3_bonus 設定適用', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 3 });
      const parent = makeAgency({ id: 'ag-p2', tier_level: 2 });
      const settings = { tier2_from_tier3_bonus: 2.5 };
      const result = calculateCommissionForSale(sale, agency, null, [parent], settings);

      expect(result.parent_commissions[0].amount).toBe(2500);
    });

    test('Tier3←Tier4 ボーナス: tier3_from_tier4_bonus 設定適用', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 4 });
      const parent = makeAgency({ id: 'ag-p3', tier_level: 3 });
      const settings = { tier3_from_tier4_bonus: 1.5 };
      const result = calculateCommissionForSale(sale, agency, null, [parent], settings);

      expect(result.parent_commissions[0].amount).toBe(1500);
    });

    test('parentChain空 → 階層ボーナスなし', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const result = calculateCommissionForSale(sale, agency, null, []);
      expect(result.parent_commissions).toHaveLength(0);
      expect(result.tier_bonus).toBe(0);
    });

    test('parentのtier_levelが同じ → ボーナスなし（tier_level < チェック）', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2 });
      const sameLevel = makeAgency({ id: 'ag-same', tier_level: 2 });
      const result = calculateCommissionForSale(sale, agency, null, [sameLevel]);
      expect(result.parent_commissions).toHaveLength(0);
    });

    test('複数親（Tier4→Tier3→Tier2→Tier1）→ 3つのボーナス', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 4 });
      const parents = [
        makeAgency({ id: 'ag-t3', tier_level: 3, company_name: 'T3' }),
        makeAgency({ id: 'ag-t2', tier_level: 2, company_name: 'T2' }),
        makeAgency({ id: 'ag-t1', tier_level: 1, company_name: 'T1' }),
      ];
      const result = calculateCommissionForSale(sale, agency, null, parents);
      expect(result.parent_commissions).toHaveLength(3);
    });
  });

  // ── インボイス控除 ────────────────────────────────────
  describe('インボイス控除', () => {
    test('インボイス未登録 → デフォルト2%控除: 8,000 × 2% = 160', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, invoice_registered: false });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.invoice_deduction).toBe(160);
      expect(result.calculation_details.invoice_deduction_rate).toBe(2.0);
      expect(result.calculation_details.invoice_registered).toBe(false);
    });

    test('インボイス登録済み → 控除なし', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, invoice_registered: true });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.invoice_deduction).toBe(0);
      expect(result.calculation_details.invoice_registered).toBe(true);
    });

    test('カスタム控除率 3% → 8,000 × 3% = 240', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, invoice_registered: false });
      const settings = { non_invoice_deduction_rate: 3.0 };
      const result = calculateCommissionForSale(sale, agency, null, [], settings);
      expect(result.invoice_deduction).toBe(240);
    });
  });

  // ── 源泉徴収 ──────────────────────────────────────────
  describe('源泉徴収', () => {
    test('個人事業主 → 10.21%源泉徴収', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, company_type: '個人' });
      const result = calculateCommissionForSale(sale, agency);
      // base=8000, invoice=0 → taxable=8000, 8000*10.21/100=816.8 → floor=816
      expect(result.calculation_details.withholding_tax).toBe(816);
      expect(result.calculation_details.withholding_rate).toBe(10.21);
    });

    test('法人 → 源泉徴収なし', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, company_type: '法人' });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.calculation_details.withholding_tax).toBeUndefined();
    });

    test('withholding_tax_flag=true → 源泉徴収あり（法人でも）', () => {
      const sale = makeSale();
      const agency = makeAgency({ company_type: '法人', withholding_tax_flag: true });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.calculation_details.withholding_tax).toBeDefined();
      expect(result.calculation_details.withholding_tax).toBeGreaterThan(0);
    });
  });

  // ── 最終金額（複合控除） ──────────────────────────────
  describe('最終金額（複合控除）', () => {
    test('個人+未登録: base=8,000 - invoice=160 - 源泉=floor((8000-160)*10.21%)=800 → final=7,040', () => {
      const sale = makeSale();
      const agency = makeAgency({
        tier_level: 2,
        company_type: '個人',
        invoice_registered: false,
      });
      const result = calculateCommissionForSale(sale, agency);
      // base = 8000
      // invoice_deduction = floor(8000 * 2 / 100) = 160
      // taxable = 8000 - 160 = 7840
      // withholding = floor(7840 * 10.21 / 100) = floor(800.464) = 800
      // final = 8000 - 160 - 800 = 7040
      expect(result.base_amount).toBe(8000);
      expect(result.invoice_deduction).toBe(160);
      expect(result.calculation_details.withholding_tax).toBe(800);
      expect(result.final_amount).toBe(7040);
    });

    test('法人+登録済み: base=8,000, 控除なし → final=8,000', () => {
      const sale = makeSale();
      const agency = makeAgency({ tier_level: 2, company_type: '法人', invoice_registered: true });
      const result = calculateCommissionForSale(sale, agency);
      expect(result.final_amount).toBe(8000);
    });
  });
});

// ══════════════════════════════════════════════════════════
// calculateMonthlyCommissions
// ══════════════════════════════════════════════════════════
describe('calculateMonthlyCommissions', () => {
  test('空配列 → []', () => {
    const result = calculateMonthlyCommissions([], [], [], '2026-01');
    expect(result).toEqual([]);
  });

  test('1売上→直接レコード+親ボーナスの2レコード', () => {
    const sales = [makeSale()];
    const agencies = [
      makeAgency({ id: 'ag-1', tier_level: 2, parent_agency_id: 'ag-parent' }),
      makeAgency({ id: 'ag-parent', tier_level: 1, company_name: '親代理店' }),
    ];
    const products = [makeProduct()];

    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01');
    expect(result).toHaveLength(2);

    const directRecord = result.find(r => r.agency_id === 'ag-1');
    const parentRecord = result.find(r => r.agency_id === 'ag-parent');

    expect(directRecord).toBeDefined();
    expect(directRecord.base_amount).toBe(8000);
    expect(directRecord.month).toBe('2026-01');

    expect(parentRecord).toBeDefined();
    expect(parentRecord.tier_bonus).toBe(2000);
    expect(parentRecord.base_amount).toBe(0);
  });

  test('Tier4→3階層分の親ボーナス → 4レコード', () => {
    const sales = [makeSale({ agency_id: 'ag-t4' })];
    const agencies = [
      makeAgency({ id: 'ag-t4', tier_level: 4, parent_agency_id: 'ag-t3' }),
      makeAgency({ id: 'ag-t3', tier_level: 3, parent_agency_id: 'ag-t2' }),
      makeAgency({ id: 'ag-t2', tier_level: 2, parent_agency_id: 'ag-t1' }),
      makeAgency({ id: 'ag-t1', tier_level: 1 }),
    ];
    const products = [makeProduct()];

    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01');
    // 1 direct + 3 parent bonus = 4
    expect(result).toHaveLength(4);
  });

  test('最低支払額未満 → carried_forward', () => {
    const sales = [makeSale({ total_amount: 10000 })]; // tiny sale
    const agencies = [makeAgency({ id: 'ag-1', tier_level: 2 })];
    const products = [makeProduct()];
    // default min = 10000, base = 10000 * 8% = 800 < 10000
    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01');
    expect(result[0].status).toBe('carried_forward');
    expect(result[0].carry_forward_reason).toContain('10,000');
  });

  test('¥10,000以上 → confirmed', () => {
    const sales = [makeSale({ total_amount: 200000 })]; // base = 16000
    const agencies = [makeAgency({ id: 'ag-1', tier_level: 2 })];
    const products = [makeProduct()];
    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01');
    expect(result[0].status).toBe('confirmed');
  });

  test('カスタム最低支払額: minimum_payment_amount=5000', () => {
    const sales = [makeSale({ total_amount: 100000 })]; // base = 8000 ≥ 5000
    const agencies = [makeAgency({ id: 'ag-1', tier_level: 2 })];
    const products = [makeProduct()];
    const settings = { minimum_payment_amount: 5000 };
    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01', settings);
    expect(result[0].status).toBe('confirmed');
  });

  test('商品なしでも動作する（products=[]）', () => {
    const sales = [makeSale({ total_amount: 200000 })];
    const agencies = [makeAgency({ id: 'ag-1', tier_level: 2 })];
    const result = calculateMonthlyCommissions(sales, agencies, [], '2026-01');
    expect(result).toHaveLength(1);
    expect(result[0].product_name).toBe('不明');
  });

  test('存在しないagency_idの売上はスキップ', () => {
    const sales = [makeSale({ agency_id: 'nonexistent' })];
    const agencies = [makeAgency({ id: 'ag-1' })];
    const result = calculateMonthlyCommissions(sales, agencies, [], '2026-01');
    expect(result).toHaveLength(0);
  });

  test('cronバグ再現: agencies=文字列(月) → TypeError', () => {
    // cron-scheduler.js が calculateMonthlyCommissions(sales, targetMonth) と呼ぶ
    // → agencies = "2026-01" (文字列), products = undefined, month = undefined
    // 文字列にはforEachメソッドがないためTypeErrorで即crash
    // 【要修正】cron-scheduler.js の呼び出しを5引数に修正すること
    const sales = [makeSale()];
    expect(() => {
      calculateMonthlyCommissions(sales, '2026-01');
    }).toThrow(TypeError);
  });

  test('キャンペーンボーナスが最初のレコードに加算される', () => {
    // Tier1で5,000,000以上 → 5%ボーナス
    const sales = [makeSale({ agency_id: 'ag-1', total_amount: 5000000 })];
    const agencies = [makeAgency({ id: 'ag-1', tier_level: 1 })];
    const products = [makeProduct()];
    const result = calculateMonthlyCommissions(sales, agencies, products, '2026-01');
    expect(result[0].campaign_bonus).toBe(250000);
    // final_amount = base(500000) + campaign(250000)
    expect(result[0].final_amount).toBe(500000 + 250000);
  });
});

// ══════════════════════════════════════════════════════════
// calculateCampaignBonus
// ══════════════════════════════════════════════════════════
describe('calculateCampaignBonus', () => {
  test('Tier1 ¥5,000,000（100%達成） → 5% = 250,000', () => {
    expect(calculateCampaignBonus(5000000, 1)).toBe(250000);
  });

  test('Tier1 ¥10,000,000 → 5% = 500,000', () => {
    expect(calculateCampaignBonus(10000000, 1)).toBe(500000);
  });

  test('Tier1 ¥2,500,000（50%達成） → 半額ボーナス = floor(2,500,000 × 0.05 × 0.5) = 62,500', () => {
    expect(calculateCampaignBonus(2500000, 1)).toBe(62500);
  });

  test('Tier1 ¥2,499,999（50%未満） → 0', () => {
    expect(calculateCampaignBonus(2499999, 1)).toBe(0);
  });

  test('Tier2 ¥3,000,000（100%達成） → 4% = 120,000', () => {
    expect(calculateCampaignBonus(3000000, 2)).toBe(120000);
  });

  test('Tier3 ¥2,000,000（100%達成） → 3% = 60,000', () => {
    expect(calculateCampaignBonus(2000000, 3)).toBe(60000);
  });

  test('Tier4 ¥1,000,000（100%達成） → 2% = 20,000', () => {
    expect(calculateCampaignBonus(1000000, 4)).toBe(20000);
  });

  test('Tier4 ¥500,000（50%達成） → 半額: floor(500,000 × 0.02 × 0.5) = 5,000', () => {
    expect(calculateCampaignBonus(500000, 4)).toBe(5000);
  });

  test('売上0 → 0', () => {
    expect(calculateCampaignBonus(0, 1)).toBe(0);
  });

  test('未知のTier → フォールバック閾値1,000,000, 率2%', () => {
    expect(calculateCampaignBonus(1000000, 99)).toBe(20000);
  });
});

// ══════════════════════════════════════════════════════════
// generateCommissionSummary
// ══════════════════════════════════════════════════════════
describe('generateCommissionSummary', () => {
  test('空配列 → 全項目0', () => {
    const summary = generateCommissionSummary([]);
    expect(summary.total_agencies).toBe(0);
    expect(summary.total_base_commission).toBe(0);
    expect(summary.total_tier_bonus).toBe(0);
    expect(summary.total_campaign_bonus).toBe(0);
    expect(summary.total_withholding_tax).toBe(0);
    expect(summary.total_final_amount).toBe(0);
    expect(summary.total_payable).toBe(0);
    expect(summary.total_carried_forward).toBe(0);
    expect(summary.by_tier).toEqual({});
  });

  test('confirmed → total_payable に加算', () => {
    const commissions = [
      { base_amount: 8000, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 8000, status: 'confirmed', tier_level: 2 },
    ];
    const summary = generateCommissionSummary(commissions);
    expect(summary.total_payable).toBe(8000);
    expect(summary.total_carried_forward).toBe(0);
  });

  test('carried_forward → total_carried_forward に加算', () => {
    const commissions = [
      { base_amount: 800, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 800, status: 'carried_forward', tier_level: 2 },
    ];
    const summary = generateCommissionSummary(commissions);
    expect(summary.total_payable).toBe(0);
    expect(summary.total_carried_forward).toBe(800);
  });

  test('Tier別集計', () => {
    const commissions = [
      { base_amount: 10000, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 10000, status: 'confirmed', tier_level: 1, total_sales: 100000 },
      { base_amount: 8000, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 8000, status: 'confirmed', tier_level: 2, total_sales: 100000 },
      { base_amount: 8000, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 8000, status: 'confirmed', tier_level: 2, total_sales: 100000 },
    ];
    const summary = generateCommissionSummary(commissions);
    expect(summary.by_tier[1].count).toBe(1);
    expect(summary.by_tier[2].count).toBe(2);
    expect(summary.total_agencies).toBe(3);
  });

  test('混合ステータスの正しい集計', () => {
    const commissions = [
      { base_amount: 8000, tier_bonus: 2000, campaign_bonus: 1000, withholding_tax: 500, final_amount: 10500, status: 'confirmed', tier_level: 1 },
      { base_amount: 600, tier_bonus: 0, campaign_bonus: 0, withholding_tax: 0, final_amount: 600, status: 'carried_forward', tier_level: 3 },
    ];
    const summary = generateCommissionSummary(commissions);
    expect(summary.total_base_commission).toBe(8600);
    expect(summary.total_tier_bonus).toBe(2000);
    expect(summary.total_campaign_bonus).toBe(1000);
    expect(summary.total_withholding_tax).toBe(500);
    expect(summary.total_final_amount).toBe(11100);
    expect(summary.total_payable).toBe(10500);
    expect(summary.total_carried_forward).toBe(600);
  });
});

// ══════════════════════════════════════════════════════════
// デフォルト定数のエクスポート確認
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// エッジケース・境界値
// ══════════════════════════════════════════════════════════
describe('エッジケース・境界値', () => {
  test('売上金額0円 → base=0', () => {
    const sale = makeSale({ total_amount: 0 });
    const agency = makeAgency({ tier_level: 2 });
    const result = calculateCommissionForSale(sale, agency);
    expect(result.base_amount).toBe(0);
    expect(result.final_amount).toBe(0);
  });

  test('売上金額が負の値 → 負の報酬（ビジネスルール上はありえないが計算は通る）', () => {
    const sale = makeSale({ total_amount: -100000 });
    const agency = makeAgency({ tier_level: 2 });
    const result = calculateCommissionForSale(sale, agency);
    // -100000 * 8 / 100 = -8000 → Math.floor → -8000
    expect(result.base_amount).toBe(-8000);
  });

  test('売上金額1円 → base=0（端数切捨て）', () => {
    const sale = makeSale({ total_amount: 1 });
    const agency = makeAgency({ tier_level: 2 });
    const result = calculateCommissionForSale(sale, agency);
    // 1 * 8 / 100 = 0.08 → Math.floor → 0
    expect(result.base_amount).toBe(0);
  });

  test('非常に大きな売上金額（1億円）', () => {
    const sale = makeSale({ total_amount: 100000000 });
    const agency = makeAgency({ tier_level: 1 });
    const result = calculateCommissionForSale(sale, agency);
    expect(result.base_amount).toBe(10000000);
  });

  test('Tier境界: Tier2とTier3の報酬差', () => {
    const sale = makeSale({ total_amount: 1000000 });
    const agencyTier2 = makeAgency({ tier_level: 2 });
    const agencyTier3 = makeAgency({ tier_level: 3 });
    const resultTier2 = calculateCommissionForSale(sale, agencyTier2);
    const resultTier3 = calculateCommissionForSale(sale, agencyTier3);
    // Tier2: 8% = 80,000, Tier3: 6% = 60,000
    expect(resultTier2.base_amount).toBe(80000);
    expect(resultTier3.base_amount).toBe(60000);
    expect(resultTier2.base_amount - resultTier3.base_amount).toBe(20000);
  });

  test('undefinedフィールドを含むsale → デフォルト動作', () => {
    const sale = { id: 'sale-u', agency_id: 'ag-1', total_amount: 100000 };
    const agency = makeAgency();
    const result = calculateCommissionForSale(sale, agency);
    expect(result.base_amount).toBe(8000);
    expect(result.sale_id).toBe('sale-u');
  });

  test('キャンペーンボーナス: 閾値ちょうど → ボーナス発生', () => {
    // Tier1の閾値は5,000,000
    expect(calculateCampaignBonus(5000000, 1)).toBe(250000);
  });

  test('キャンペーンボーナス: 閾値1円未満 → ボーナスなし', () => {
    expect(calculateCampaignBonus(2499999, 1)).toBe(0);
  });
});

describe('定数エクスポート', () => {
  test('DEFAULT_TIER_RATES が正しい値', () => {
    expect(DEFAULT_TIER_RATES).toEqual({ 1: 10, 2: 8, 3: 6, 4: 4 });
  });

  test('DEFAULT_HIERARCHY_BONUS_RATES が正しい値', () => {
    expect(DEFAULT_HIERARCHY_BONUS_RATES).toEqual({ 1: 2, 2: 1.5, 3: 1, 4: 0 });
  });
});
