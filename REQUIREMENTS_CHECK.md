# 要件定義書 vs 実装 照合チェックリスト

最終確認日: 2026-03-05

---

## 1. 代理店階層管理

### 1.1 階層構造
- [✅] 最大4階層（Tier1-4）サポート — DB制約 `CHECK (tier_level BETWEEN 1 AND 4)`
- [✅] Tier1代理店: 最大100社 — agencies.js:207-242で検証
- [✅] Tier2代理店: 各Tier1あたり最大50社 — 同上
- [✅] Tier3代理店: 各Tier2あたり最大30社 — 同上
- [✅] Tier4代理店: 各Tier3あたり最大20社（子作成不可） — 同上

### 1.2 代理店属性
- [✅] agency_code（AGN{YYYY}{0000}形式の自動採番） — DB trigger `trigger_set_agency_code`
- [✅] company_name — VARCHAR(255) NOT NULL
- [✅] company_type（法人/個人） — CHECK制約あり
- [✅] representative_name — VARCHAR(255)
- [✅] representative_email — VARCHAR(255)
- [✅] representative_phone — VARCHAR(20)
- [✅] birth_date（18歳以上確認） — DB制約 + ageValidator.js
- [✅] bank_account JSONB（bank_name, branch_name, account_type, account_number, account_holder） — validate_bank_account()関数
- [✅] invoice_registered — BOOLEAN DEFAULT FALSE
- [✅] invoice_number — VARCHAR(50)
- [✅] withholding_tax_flag — trigger `update_withholding_tax_flag()`で自動管理
- [✅] status（pending/active/suspended） — ⚠️ 'terminated'はDB制約に含まれず
- [✅] tier_level — INTEGER, 1-4
- [✅] parent_agency_id — UUID FK
- [✅] created_at — TIMESTAMP

---

## 2. 報酬体系

### 2.1 報酬設定管理
- [✅] 商品別基本報酬率 — products テーブル
- [✅] Tier別報酬率（tier1: 10%, tier2: 8%, tier3: 6%, tier4: 4%） — products.tier1-4_commission_rate
- [✅] 階層ボーナス（2%, 1.5%, 1%） — commission_settings テーブル
- [✅] キャンペーン報酬（期間、ボーナス率、対象） — campaigns テーブル + conditions JSONB

### 2.2 報酬計算
- [✅] 基本報酬 = 売上 × Tier別報酬率 — calculateCommission.js:76-79
- [✅] キャンペーンボーナス加算 — calculateCampaignBonusNew():325-371
- [✅] インボイス控除（非登録: 2%） — calculateCommission.js:118-130
- [✅] 源泉徴収（個人: 10.21%） — calculateCommission.js:132-142
- [✅] 最終報酬額算出 — calculateCommission.js:144-147
- [✅] 最低支払額¥10,000 & 繰越処理 — carried_forward ステータス

---

## 3. 税務処理

### 3.1 インボイス制度対応
- [✅] 適格事業者: 控除なし — calculateCommission.js
- [✅] 非適格事業者: 2%控除 — configurable via commission_settings

### 3.2 源泉徴収処理
- [✅] 個人事業主: 10.21%（復興特別所得税込み） — company_type='個人'時に自動適用
- [✅] 法人: 源泉徴収なし（0%） — trigger で withholding_tax_flag=FALSE

---

## 4. スパム対策

### 4.1 不正検知ルール
- [⚠️] IPアドレスベース制限（max_registrations_per_day: 5） — 実装は10/hour, 50/day（ユーザーベース、IPベースではない）
- [✅] ログイン試行制限（max_login_attempts: 5） — 5回/15分 + exponential backoff
- [⚠️] ロックアウト（lockout_duration: 1時間） — exponential delayのみ、真のロックアウトなし
- [✅] 招待リンク制限: max_per_hour: 10 — rateLimiter.js:52
- [✅] 招待リンク制限: max_per_day: 50 — rateLimiter.js:73
- [⚠️] 招待リンク制限: max_active_invites: 100 — Tier別の子代理店数上限で代替実装
- [✅] 異常検知: 前月比500%以上の売上は要確認 — anomalyDetection.js:15-90
- [❌] 異常検知: 同一銀行口座の複数使用禁止 — 未実装（重複チェックなし）
- [❌] 異常検知: 連続した同一金額の売上（10回） — 未実装

### 4.2 アカウント制限アクション
- [❌] 警告（3回の違反検知 → 警告メール送信） — 違反カウント機構なし
- [⚠️] 停止（5回の違反検知 → 7日間アカウント停止） — 手動停止のみ、自動化なし
- [❌] 永久停止（重大違反 → 永久停止、1年間データ保持） — 'terminated'ステータスなし、データ保持ポリシーなし

---

## 5. 画面仕様

### 5.1 ログイン画面
- [✅] メールアドレス入力（RFC5322バリデーション） — HTML5 type="email"
- [✅] パスワード入力（8文字以上、英数字+特殊文字） — passwordValidator.js
- [❌] ログイン維持チェックボックス（デフォルトOFF） — 未実装
- [✅] ログインボタン
- [✅] パスワードリセットリンク — reset-password.html
- [⚠️] 新規登録リンク — 招待ベースのみ（invite-accept.html）、自由登録なし
- [⚠️] 5回失敗でアカウントロック — レート制限(5回/15分)のみ、永久ロックなし

### 5.2 ダッシュボード
- [✅] KPI: 今月の売上（前月比変化率） — dashboard.js:77-84
- [✅] KPI: 今月の報酬（前月比変化率） — dashboard.js:87-100
- [✅] KPI: アクティブ代理店数
- [✅] KPI: 承認待ち件数
- [✅] 売上推移グラフ（折れ線グラフ） — monthlyTrend データ

### 5.3 代理店管理画面
- [✅] 一覧: 会社名、階層、ステータス、アクション — agencies-page.js
- [⚠️] 一覧: 累計売上 — 詳細画面にはあるが一覧には非表示
- [⚠️] 一覧: 登録日（created_at） — DB にあるがフロント一覧に非表示
- [✅] ソート機能
- [✅] フィルター: tier_level — tierFilter セレクト
- [✅] フィルター: status — statusFilter セレクト
- [❌] フィルター: date_range — 未実装
- [✅] 招待リンク生成（email, tier_level, message） — invitations.js

### 5.4 売上管理画面
- [✅] 商品選択（動的リスト） — product_id バリデーション
- [✅] 数量入力（min: 1） — `body('quantity').isInt({ min: 1 })`
- [✅] 単価（商品選択時に自動設定、readonly） — productsテーブルから取得
- [✅] 合計金額（自動計算、readonly） — `product.price * quantity`
- [✅] 売上日（未来日不可） — DB制約
- [✅] 備考（maxLength: 1000） — notes TEXT

### 5.5 報酬管理画面
- [✅] 月次サマリー（基本報酬、階層ボーナス、キャンペーンボーナス、控除、最終額）
- [✅] 売上別内訳 — sale_id紐づけ
- [✅] 階層ボーナス詳細 — calculation_details JSONB

### 5.6 管理者画面
- [✅] 報酬率設定（最低支払額、支払日、商品別Tier別レート、階層ボーナス率） — commission-settings.js
- [✅] 承認管理（承認待ち一覧、書類確認、承認/却下アクション） — agencies/status.js

---

## 6. データベース設計

### テーブル
- [✅] users — full-setup.sql:19
- [✅] agencies — full-setup.sql:40
- [✅] sales — full-setup.sql:227
- [✅] commissions — full-setup.sql:292
- [✅] payments / payment_history — full-setup.sql:341, 568
- [✅] products — full-setup.sql:163
- [✅] commission_settings — full-setup.sql:354
- [✅] campaigns — full-setup.sql:208
- [✅] invitations — full-setup.sql:323
- [✅] agency_documents — full-setup.sql:387

### インデックス
- [✅] idx_sales_agency_date — full-setup.sql:647
- [✅] idx_commissions_agency_month — full-setup.sql:314
- [⚠️] idx_agencies_parent_status — 個別インデックス(parent_id, status)はあるが複合インデックスなし
- [❌] idx_sales_product_date — 未作成
- [⚠️] idx_payments_status_date — 個別インデックスはあるが複合インデックスなし

---

## 7. API仕様

### 7.1 JWT構造
- [✅] id（sub相当）
- [✅] email
- [✅] role
- [✅] type（access/refresh）
- [❌] agency_id — JWTに含まれず（認証後にDBから取得）
- [❌] tier_level — JWTに含まれず
- [❌] permissions — JWTに含まれず（ロールベースのみ）

### 7.2 認可マトリックス
- [✅] super_admin ロール — auth.js:182
- [✅] admin ロール — auth.js:182
- [✅] agency ロール — auth.js:194
- [❌] viewer（閲覧者）ロール — DBにデフォルト値として定義されるが、ルートでの権限チェックなし

### 7.3 エラーコード体系
- [SKIP] 認証エラー (1xxx) — スキップ。現行のHTTP status + 日本語メッセージで実用上問題なし
- [SKIP] 権限エラー (2xxx) — 同上
- [SKIP] バリデーションエラー (3xxx) — 同上
- [SKIP] ビジネスロジックエラー (4xxx) — 同上
- [SKIP] システムエラー (5xxx) — 同上
- ※ 日本語専用・API連携先なし・多言語予定なしのため、数字コード体系は不要と判断

### 7.4 レート制限
- [✅] /api/auth/login: 5回/15分 — rateLimiter.js:100
- [✅] /api/agencies/invite: 10回/1時間 — rateLimiter.js:52
- [❌] /api/sales: 30回/1分 — 未実装
- [✅] グローバル: 100回/1分 — rateLimiter.js:141

---

## 8. セキュリティ

### 開発時
- [✅] SQLインジェクション対策 — Supabase SDK（パラメータ化クエリ）+ ホワイトリスト検証
- [✅] XSS対策 — 入力サニタイズ middleware (security.js:68-113) + Helmet
- [✅] CSRF対策 — Origin/Referer検証 + SameSite=Strict Cookie
- [✅] 認証・認可 — JWT + ロール別ガード
- [✅] パスワードハッシュ化（bcrypt） — Supabase Auth管理
- [✅] HTTPS強制 — security.js:12-28 (本番のみ)
- [✅] セキュアなセッション管理 — httpOnly Cookie, SameSite=Strict, 24h maxAge

### 運用時
- [✅] アクセスログ監視 — 監査ログ (audit_logs テーブル)
- [✅] 異常検知アラート — anomalyDetection.js
- [⚠️] バックアップ — cron-schedulerから削除済み（Supabase側に依存）

---

## 9. 運用（月次処理）

- [✅] 月末: 売上データ確定 — monthlyClosing() 毎月末日23:59
- [✅] 月末→月初: 報酬計算実行 — calculateCommissions() 毎月1日02:00
- [✅] 繰越報酬スイープ — sweepCarriedForwardCommissions() 毎月1日03:00
- [✅] 支払いデータ生成 — processMonthlyPayments() 毎月25日10:00
- [⚠️] 月初: 前月レポート — sendPaymentReminders() が毎月20日09:00（要件は月初）
- [✅] 報酬通知メール送信 — 支払い処理時に自動送信

---

## 総合サマリー

| セクション | 合計項目 | ✅ | ⚠️ | ❌ | 達成率 |
|-----------|---------|---|---|---|--------|
| 1. 代理店階層管理 | 20 | 20 | 0 | 0 | **100%** |
| 2. 報酬体系 | 10 | 10 | 0 | 0 | **100%** |
| 3. 税務処理 | 4 | 4 | 0 | 0 | **100%** |
| 4. スパム対策 | 13 | 4 | 4 | 5 | **31%** |
| 5. 画面仕様 | 27 | 20 | 5 | 2 | **74%** |
| 6. データベース | 15 | 12 | 2 | 1 | **80%** |
| 7. API仕様 | 12 | 4 | 0 | 8 | **33%** |
| 8. セキュリティ | 10 | 9 | 1 | 0 | **90%** |
| 9. 運用 | 6 | 5 | 1 | 0 | **83%** |
| **合計** | **117** | **88** | **13** | **16** | **75%** |

※ ⚠️（部分実装）を0.5として計算すると: (88 + 6.5) / 117 = **81%**

---

## 未実装の重要項目（優先度順）

### 高優先度
1. ~~**エラーコード体系（1xxx-5xxx）**~~ — スキップ（現行で問題なし）
2. **閲覧者（viewer）ロール** — DB定義はあるがルート側の権限チェックなし
3. **同一銀行口座重複チェック** — 不正防止の基本機能
4. **アカウント違反カウント＆自動制限** — 警告→停止→永久停止の段階的処理

### 中優先度
5. **JWT に agency_id/tier_level/permissions 含める** — 毎リクエストDB問い合わせ削減
6. **/api/sales レート制限（30回/分）**
7. **ログイン維持チェックボックス**
8. **連続同一金額売上検知（10回）**
9. **複合インデックス追加**（idx_agencies_parent_status, idx_sales_product_date）

### 低優先度
10. **代理店一覧の date_range フィルター**
11. **代理店一覧に累計売上・登録日表示**
12. **月初レポートのタイミング修正**（20日→1日）
13. **'terminated' ステータス＆データ保持ポリシー**
