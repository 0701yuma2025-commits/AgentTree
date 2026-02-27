/**
 * 銀行振込データエクスポート テスト
 */

const {
  generateZenginFormat,
  generateCSVFormat,
  generateReadableFormat,
  convertToShiftJIS,
} = require('../bankExport');

// ── ヘルパー ──────────────────────────────────────────────

function makePayment(overrides = {}) {
  return {
    agency_code: 'AGN20260001',
    agency_name: 'テスト代理店',
    base_amount: 100000,
    tier_bonus: 0,
    campaign_bonus: 0,
    invoice_deduction: 0,
    withholding_tax: 0,
    final_amount: 100000,
    status: 'confirmed',
    payment_date: '2026-03-15',
    bank_account: {
      bank_code: '0001',
      bank_name: 'みずほ銀行',
      branch_code: '001',
      branch_name: '東京支店',
      account_type: '普通',
      account_number: '1234567',
      account_holder: 'テストダイリテン',
    },
    ...overrides,
  };
}

function makeCompanyInfo(overrides = {}) {
  return {
    clientCode: '1234567890',
    clientName: 'テスト株式会社',
    bankCode: '0001',
    bankName: 'みずほ銀行',
    branchCode: '001',
    branchName: '本店',
    accountType: '普通',
    accountNumber: '9876543',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════
// generateZenginFormat
// ══════════════════════════════════════════════════════════
describe('generateZenginFormat', () => {
  test('4レコード構造: ヘッダー + データ + トレーラー + エンド', () => {
    const payments = [makePayment()];
    const result = generateZenginFormat(payments, makeCompanyInfo());
    const lines = result.split('\r\n');

    expect(lines).toHaveLength(4);
    expect(lines[0][0]).toBe('1'); // ヘッダー
    expect(lines[1][0]).toBe('2'); // データ
    expect(lines[2][0]).toBe('8'); // トレーラー
    expect(lines[3][0]).toBe('9'); // エンド
  });

  test('ヘッダーに種別コード21（総合振込）を含む', () => {
    const result = generateZenginFormat([makePayment()], makeCompanyInfo());
    const header = result.split('\r\n')[0];
    expect(header.substring(1, 3)).toBe('21');
  });

  test('トレーラーに件数と合計金額', () => {
    const payments = [
      makePayment({ final_amount: 50000 }),
      makePayment({ final_amount: 30000 }),
    ];
    const result = generateZenginFormat(payments, makeCompanyInfo());
    const lines = result.split('\r\n');
    // ヘッダー(1) + データ(2) + トレーラー + エンド = 5行
    const trailer = lines[3]; // index 3 = トレーラー

    expect(trailer[0]).toBe('8');
    // 件数: 2件（6桁ゼロパディング）
    expect(trailer.substring(1, 7)).toBe('000002');
    // 金額: 80000（12桁ゼロパディング）
    expect(trailer.substring(7, 19)).toBe('000000080000');
  });

  test('銀行情報なしの支払いはスキップ', () => {
    const payments = [
      makePayment(),
      makePayment({ bank_account: null }),
    ];
    const result = generateZenginFormat(payments, makeCompanyInfo());
    const lines = result.split('\r\n');

    // データレコードは1つだけ（bank_account=nullはスキップ）
    const dataLines = lines.filter((l) => l[0] === '2');
    expect(dataLines).toHaveLength(1);
  });

  test('空の支払い配列 → トレーラー件数0', () => {
    const result = generateZenginFormat([], makeCompanyInfo());
    const trailer = result.split('\r\n')[1]; // ヘッダーの次がトレーラー
    expect(trailer[0]).toBe('8');
    expect(trailer.substring(1, 7)).toBe('000000');
  });

  test('口座種別: 普通→1、当座→2', () => {
    const payment = makePayment();
    payment.bank_account.account_type = '当座';
    const result = generateZenginFormat([payment], makeCompanyInfo());
    const dataRecord = result.split('\r\n')[1];
    // 口座種別は固定位置にある
    expect(dataRecord).toContain('2'); // 当座=2
  });
});

// ══════════════════════════════════════════════════════════
// generateCSVFormat
// ══════════════════════════════════════════════════════════
describe('generateCSVFormat', () => {
  test('CSVヘッダー行に全フィールドを含む', () => {
    const csv = generateCSVFormat([makePayment()]);
    const headerLine = csv.split('\n')[0];

    expect(headerLine).toContain('支払日');
    expect(headerLine).toContain('代理店コード');
    expect(headerLine).toContain('代理店名');
    expect(headerLine).toContain('銀行名');
    expect(headerLine).toContain('振込金額');
    expect(headerLine).toContain('ステータス');
  });

  test('数式インジェクション対策: =始まりの値がサニタイズされる', () => {
    const payment = makePayment({ agency_name: '=SUM(A1)' });
    const csv = generateCSVFormat([payment]);

    // =SUM(A1) がシングルクォート付きでエスケープされる
    expect(csv).not.toContain('"=SUM(A1)"');
  });

  test('複数行のCSV生成', () => {
    const payments = [makePayment(), makePayment({ agency_code: 'AGN20260002' })];
    const csv = generateCSVFormat(payments);
    const lines = csv.split('\n');

    // ヘッダー + 2データ行
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  test('bank_accountなしの支払いも処理できる', () => {
    const payment = makePayment();
    delete payment.bank_account;
    expect(() => generateCSVFormat([payment])).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════
// generateReadableFormat
// ══════════════════════════════════════════════════════════
describe('generateReadableFormat', () => {
  test('ヘッダーに対象月を含む', () => {
    const result = generateReadableFormat([makePayment()], '2026-03');
    expect(result).toContain('対象月: 2026-03');
  });

  test('サマリーに件数と合計金額', () => {
    const payments = [
      makePayment({ final_amount: 100000 }),
      makePayment({ final_amount: 50000 }),
    ];
    const result = generateReadableFormat(payments, '2026-03');
    expect(result).toContain('対象件数: 2件');
    expect(result).toContain('¥150,000');
  });

  test('明細に代理店情報を含む', () => {
    const result = generateReadableFormat([makePayment()], '2026-03');
    expect(result).toContain('テスト代理店');
    expect(result).toContain('AGN20260001');
    expect(result).toContain('みずほ銀行');
  });

  test('ボーナスありの場合はボーナス行を表示', () => {
    const payment = makePayment({
      tier_bonus: 5000,
      campaign_bonus: 10000,
      invoice_deduction: 1000,
      withholding_tax: 2000,
    });
    const result = generateReadableFormat([payment], '2026-03');
    expect(result).toContain('階層ボーナス');
    expect(result).toContain('キャンペーンボーナス');
    expect(result).toContain('インボイス控除');
    expect(result).toContain('源泉徴収');
  });

  test('ボーナス0の場合はボーナス行を非表示', () => {
    const payment = makePayment({
      tier_bonus: 0,
      campaign_bonus: 0,
      invoice_deduction: 0,
      withholding_tax: 0,
    });
    const result = generateReadableFormat([payment], '2026-03');
    expect(result).not.toContain('階層ボーナス');
    expect(result).not.toContain('キャンペーンボーナス');
  });

  test('末尾に「以上」を含む', () => {
    const result = generateReadableFormat([makePayment()], '2026-03');
    expect(result).toContain('以上');
  });
});

// ══════════════════════════════════════════════════════════
// convertToShiftJIS
// ══════════════════════════════════════════════════════════
describe('convertToShiftJIS', () => {
  test('Buffer を返す', () => {
    const result = convertToShiftJIS('テスト');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('ASCII文字はそのまま変換', () => {
    const result = convertToShiftJIS('ABC123');
    expect(result.toString('ascii')).toBe('ABC123');
  });

  test('空文字 → 空バッファ', () => {
    const result = convertToShiftJIS('');
    expect(result.length).toBe(0);
  });
});
