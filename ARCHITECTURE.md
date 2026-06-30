# AgentTree - システムアーキテクチャ

多段階営業代理店管理システム（Multi-tier Sales Agency Management System）

> **Version 2.0.0** ｜ 最終更新: 2026-06-30
>
> **v2.0.0 メジャー更新（v1.0.0 → 2.0.0）の要点**
> - **報酬計算エンジン刷新（シナリオC）**: 設定不能でハードコードだった旧「売上目標達成ボーナス（閾値自動付与）」を廃止し、`campaigns` テーブル連動の新キャンペーン機能に全経路で一本化。二重計上・経路差・金額水増しを解消。
> - **源泉徴収を外交員報酬モデルに対応**: 個人事業主は「(その月の報酬合計 − インボイス控除 − 月12万円) に累進税率」で月次確定。基本報酬だけでなく階層/キャンペーンボーナスも課税。**100万円超は20.42%**の累進。率・閾値・月控除・インボイス控除率はすべて `commission_settings` で変更可能。
> - **最終金額の統一式(A)**: `基本報酬 + 全ボーナス − インボイス未登録控除 − 源泉徴収 = final_amount`。報酬画面・請求書・振込データがすべて同じ `final_amount` を正とする。
> - **代理店階層 1〜5次（Tier1-5）** に拡張。**中間代理店の削除時に配下を自動繰り上げ（穴埋め）するDBトリガー**を追加。
> - **セキュリティ強化**: httpOnly Cookie 認証・refresh 時に最新 role/状態をDB再取得・CSRF を全環境(test除く)常時化・招待トークンの sha256 ハッシュ化・RLS 整備・支払い/承認の冪等化・各種IDOR是正。
> - **DB 原子化 RPC**（`recalculate_commissions` / `replace_sale_commissions`）と **重複防止 UNIQUE インデックス**、支払い/承認列(009)・notes列(010)を追加。マイグレーション **006〜014** を整備。

## 概要

営業代理店の階層管理・売上追跡・報酬計算・請求書/領収書発行を一元管理するWebアプリケーション。
**最大5段階（Tier1-5）**の代理店階層をサポートし、Tier別報酬・階層ボーナス・キャンペーンボーナス（設定可能）・源泉徴収（外交員報酬モデル）・インボイス制度に対応。

```
┌────────────────────────────────────────────────────────┐
│                      Frontend                          │
│              Vanilla JS SPA (Render)                   │
│         https://agenttree-frontend.onrender.com        │
└────────────────────┬───────────────────────────────────┘
                     │ HTTPS (REST API)
                     │ JWT Bearer Token
┌────────────────────┴───────────────────────────────────┐
│                      Backend                           │
│              Express.js (Render)                       │
│           https://agenttree.onrender.com               │
└────────────────────┬───────────────────────────────────┘
                     │
┌────────────────────┴───────────────────────────────────┐
│                     Database                           │
│              Supabase (PostgreSQL)                     │
│              + Storage (ファイル)                       │
└────────────────────────────────────────────────────────┘
```

---

## 技術スタック

| レイヤー | 技術 | バージョン |
|---------|------|-----------|
| **アプリ** | **AgentTree** | **2.0.0** |
| Frontend | Vanilla JavaScript (SPA) | ES2020+ |
| Backend | Node.js + Express | Node >=18, Express 4.18 |
| Database | Supabase (PostgreSQL) | supabase-js 2.39 |
| Auth | JWT (jsonwebtoken) + httpOnly Cookie | 9.0 |
| PDF | PDFKit + QRCode | 0.17 |
| Email | Resend API | 6.1 |
| テスト | Jest + Supertest | Jest 29, Supertest 7.2 |
| デプロイ | Render (Backend + Frontend) | Auto-deploy from main |

---

## ディレクトリ構成

```
agency-system-v2/
├── backend/                    # Express.js APIサーバー (~16,500行)
│   ├── server.js               # エントリーポイント (ミドルウェア・ルート登録)
│   ├── package.json
│   ├── jest.setup.js
│   └── src/
│       ├── config/
│       │   └── supabase.js     # Supabaseクライアント初期化
│       ├── middleware/
│       │   ├── auth.js         # JWT認証・ロール認可
│       │   ├── auditLog.js     # 監査ログ (非同期記録)
│       │   ├── security.js     # HTTPS強制, ヘッダー, サニタイズ, SQLi防止, IP遮断
│       │   ├── advancedRateLimit.js  # エンドポイント別レート制限
│       │   ├── rateLimiter.js  # 基本レート制限
│       │   └── __tests__/
│       ├── routes/
│       │   ├── auth.js         # POST /login, /logout, /refresh
│       │   ├── auth/
│       │   │   ├── account.js  # PUT /change-email, /change-password
│       │   │   └── two-factor.js  # 2FA TOTP設定・検証
│       │   ├── agencies.js     # CRUD + 階層管理
│       │   ├── agencies/
│       │   │   ├── status.js   # 承認/却下/停止/再開
│       │   │   └── export-history.js
│       │   ├── sales.js        # 売上CRUD
│       │   ├── sales/
│       │   │   ├── mutations.js   # 売上作成・更新・削除
│       │   │   ├── history.js     # 変更履歴
│       │   │   ├── anomaly.js     # 異常検知・レビュー
│       │   │   └── export.js      # CSVエクスポート・サマリー
│       │   ├── commissions.js     # 報酬計算・一覧・承認
│       │   ├── commission-settings.js  # 報酬設定マスタ
│       │   ├── invoices.js        # 請求書/領収書PDF生成
│       │   ├── documents.js       # 書類アップロード・承認
│       │   ├── document-recipients.js  # 宛先テンプレート
│       │   ├── payments.js        # 支払い処理・全銀ファイル出力
│       │   ├── products.js        # 商品CRUD
│       │   ├── campaigns.js       # キャンペーン管理
│       │   ├── dashboard.js       # KPIダッシュボード
│       │   ├── notifications.js   # 通知送信・履歴
│       │   ├── network.js         # 階層ネットワークデータ
│       │   ├── invitations.js     # 代理店招待
│       │   ├── audit-logs.js      # 監査ログ検索・CSVエクスポート
│       │   └── __tests__/         # 全ルートのテスト (17ファイル)
│       ├── services/
│       │   └── emailService.js    # Resend APIメール送信
│       ├── utils/
│       │   ├── calculateCommission.js  # 多段階報酬計算エンジン
│       │   ├── anomalyDetection.js     # 異常検知アルゴリズム
│       │   ├── pdf-generator.js        # PDF生成 (請求書/領収書/明細書)
│       │   ├── passwordValidator.js    # パスワード強度・類似性検証
│       │   ├── ageValidator.js         # 年齢検証 (18歳以上)
│       │   ├── bankExport.js           # 全銀フォーマット出力
│       │   ├── csvSanitizer.js         # CSVインジェクション防止
│       │   ├── agencyHelpers.js        # 傘下代理店ID取得
│       │   ├── generateCode.js         # コード自動生成
│       │   ├── errorHelper.js          # エラーハンドリング
│       │   ├── pagination.js           # ページネーション
│       │   ├── emailSender.js          # メール送信ラッパー
│       │   └── __tests__/              # ユーティリティテスト (12ファイル)
│       └── scripts/
│           ├── cron-scheduler.js       # 定時バッチ処理
│           ├── create-admin.js         # 管理者アカウント作成CLI
│           ├── test-payment-process.js # 支払い処理テスト
│           └── test-payment-detailed.js # 支払い処理詳細テスト
│
├── frontend/                   # Vanilla JS SPA (~15,000行)
│   ├── index.html              # メインSPA (ログイン/2FA/メイン画面)
│   ├── invite-accept.html      # 招待受付ページ
│   ├── reset-password.html     # パスワードリセット
│   ├── set-password.html       # 初期パスワード設定
│   ├── package.json
│   ├── jest.setup.js
│   ├── css/
│   │   ├── style.css           # メインスタイル (2,873行)
│   │   └── modal.css           # モーダルスタイル
│   └── js/
│       ├── app.js              # SPAルーター・ナビゲーション
│       ├── config.js           # API URL・定数
│       ├── api/                # APIクライアント層
│       │   ├── client.js       # fetch ラッパー (認証ヘッダー・エラー処理)
│       │   ├── auth.js
│       │   ├── agencies.js
│       │   ├── sales.js
│       │   ├── commissions.js
│       │   ├── commission-settings.js
│       │   ├── campaigns.js
│       │   ├── products.js
│       │   ├── documents.js
│       │   ├── document-recipients.js
│       │   └── audit-logs.js
│       ├── pages/              # ページコントローラー
│       │   ├── dashboard-page.js      # KPIカード・チャート
│       │   ├── agencies-page.js       # 代理店一覧
│       │   ├── agencies-detail-page.js # 代理店詳細
│       │   ├── sales-page.js          # 売上管理
│       │   ├── commissions.js         # 報酬一覧・分析
│       │   ├── commission-settings.js # 報酬設定
│       │   ├── invoices.js            # 請求書/領収書
│       │   ├── documents.js           # 書類管理
│       │   ├── products.js            # 商品管理
│       │   ├── campaigns.js           # キャンペーン
│       │   ├── network.js             # 3D階層ネットワーク (Three.js)
│       │   ├── audit-logs.js          # 監査ログ
│       │   └── settings.js            # 設定 (アカウント・会社情報)
│       ├── utils/
│       │   ├── ageValidator.js
│       │   └── tableHelper.js         # テーブル描画・ソート・ページネーション
│       ├── components/
│       │   └── documents.js
│       └── __tests__/                 # フロントエンドテスト (3ファイル)
│
├── database/                   # DBスキーマ・マイグレーション
│   ├── full-setup.sql          # 完全セットアップ (全テーブル・トリガー・インデックス)
│   ├── migrations/
│   │   ├── 001_add_operator_invoice_number.sql
│   │   ├── 002_add_violation_count_and_terminated.sql
│   │   ├── 003_add_composite_indexes.sql
│   │   ├── 004_add_tier5_support.sql            # Tier5対応 (4→5次へ拡張)
│   │   ├── 005_delete_test_admins.sql
│   │   ├── 006_rls_hardening.sql                # RLS整備 (defense-in-depth)
│   │   ├── 007_recalculate_commissions_rpc.sql  # 月次報酬の原子的再計算RPC
│   │   ├── 008_invitation_rpcs.sql              # 招待RPC(create/validate/accept)+トークンsha256ハッシュ化
│   │   ├── 009_add_commission_payment_columns.sql # paid_at/paid_by/payment_method/transaction_id/approved_at/approved_by
│   │   ├── 010_add_commission_notes.sql         # notes列 (/status用)
│   │   ├── 011_replace_sale_commissions_rpc.sql # 売上更新の原子的置換RPC
│   │   ├── 012_drop_upsert_monthly_commissions.sql # 危険な未使用RPCの削除
│   │   ├── 013_unique_commission_sale_agency.sql # (sale_id,agency_id)部分UNIQUEで重複防止
│   │   └── 014_promote_orphaned_agencies.sql    # 中間代理店削除時の自動繰り上げトリガー
│   └── README.md               # テストデータ構成
│   # 注: DDLはSUPABASE_SERVICE_KEY(PostgREST)では実行不可。Supabase SQL Editorで手動適用する。
│
├── .env                        # 環境変数 (実値)
├── .env.example                # 環境変数テンプレート
├── .gitignore
├── README.md                   # クイックスタート
├── TODO_REQUIREMENTS.md        # 実装進捗トラッキング
└── ARCHITECTURE.md             # このファイル
```

---

## データベース設計

### ER図 (主要テーブル)

```
users ──────────────── agencies (1:1 user_id)
                          │
                          ├── agencies (self-ref: parent_agency_id) ← 1〜5階層 (Tier1-5)
                          │     ※中間削除時はトリガーで配下を自動繰り上げ(穴埋め)
                          │
                          ├── sales ──── commissions
                          │                  │
                          │                  └── payment_history
                          │
                          ├── agency_documents
                          │
                          ├── invitations (inviter/parent)
                          │
                          └── notification_settings
                               notification_history

products ──── sales (product_id)
campaigns ──── commissions (campaign_id)

commission_settings (グローバル設定マスタ)
audit_logs (全操作の監査記録)
sale_change_history (売上変更追跡)
document_recipients (宛先テンプレート)
notification_templates (通知テンプレート)
```

### テーブル一覧 (主要)

| テーブル | 概要 | 主なカラム |
|---------|------|-----------|
| `users` | ユーザー認証 | email, password_hash, role, is_active, 2FA fields |
| `agencies` | 代理店 | company_name, **tier_level(1-5)**, parent_agency_id, company_type(法人/個人), withholding_tax_flag, bank_account(JSONB), invoice_registered, invoice_number |
| `products` | 商品 | product_code, price, **tier1~5_commission_rate** |
| `sales` | 売上 | sale_number, agency_id, total_amount, anomaly_score |
| `commissions` | 報酬 | base_amount, tier_bonus, campaign_bonus, withholding_tax, final_amount, month, status, **paid_at/paid_by/payment_method/transaction_id/approved_at/approved_by(009)**, **notes(010)**, payment_date, calculation_details(JSONB)。**(sale_id,agency_id)部分UNIQUE(013)** |
| `commission_settings` | 報酬設定 | minimum_payment_amount, tier別ボーナス率, 源泉徴収率, **源泉100万円超率(20.42%)・外交員月控除(12万)**, インボイス控除率 |
| `payment_records` | 支払い記録 | agency_id, month, payment_date, status, total_amount |
| `campaigns` | キャンペーン | bonus_rate, target_tier_levels, start/end_date |
| `payment_history` | 支払い履歴 | agency_id, amount, payment_method |
| `invitations` | 招待 | token, tier_level, expires_at |
| `agency_documents` | 書類 | document_type, file_url, status(pending/verified/rejected) |
| `document_recipients` | 宛先テンプレート | template_name, company_name, address |
| `notification_settings` | 通知設定 | email_enabled, frequency |
| `notification_history` | 通知履歴 | type, subject, status |
| `notification_templates` | 通知テンプレート | template_code, body_template |
| `sale_change_history` | 売上変更履歴 | field_name, old_value, new_value |
| `audit_logs` | 監査ログ | action, resource_type, changes(JSONB), ip_address |

### DBの特徴

- **UUID主キー**: 全テーブルで `gen_random_uuid()` 使用
- **自動採番**: 代理店コード(`AGN2026XXXX`)、売上番号(`SL202601-00001`)、商品コード(`PRD00000001`)
- **自動トリガー**: `updated_at`自動更新、源泉徴収フラグ自動設定、通知設定自動作成、**中間代理店削除時の配下自動繰り上げ(`promote_orphaned_agencies` / 014)**
- **バリデーション制約**: 18歳以上、銀行口座JSONB構造、報酬率0-100%
- **JSONB活用**: bank_account, tax_info, metadata, conditions, calculation_details, changes

### DB側ロジック (RPC・トリガー)

| 種別 | 名前 | 役割 |
|------|------|------|
| RPC | `recalculate_commissions(month, rows)` (007) | 月次報酬の再計算を **DELETE(非確定のみ)+INSERT を単一トランザクション**で原子的に実行。approved/paid を保護。手動/calculate・cron が使用 |
| RPC | `replace_sale_commissions(sale_id, rows)` (011) | 売上更新時の報酬を原子的に置換（非確定行を削除→再構築）。幽霊行・親追加削除に対応 |
| RPC | `create_invitation` / `validate_invitation` / `accept_invitation` (008) | 招待トークンを **sha256ハッシュで保存・照合**（平文はURLのみ）。accept時に子代理店+usersミラー作成 |
| Trigger | `promote_orphaned_agencies` (014, BEFORE DELETE) | 中間代理店削除時、直下の子を祖父へ繋ぎ替え+配下の枝ごと tier_level を1段繰り上げ |
| 制約 | `uq_commissions_sale_agency` (013) | `(sale_id, agency_id)` 部分UNIQUE で報酬の重複INSERTを防止 |

> 注: 本番は `SUPABASE_SERVICE_KEY`（PostgREST）で接続するため **RLSはバイパス**される。実際の認可は Express 層（ルートガード+クエリスコープ、認可キーは `agencies.user_id` を正とし「自分+全子孫」スコープ・fail-closed）が担う。RLS(006)は防御の最終層。

---

## 認証・認可フロー

```
[ログイン]
  Email + Password → POST /api/auth/login
                       ↓
                  Supabase Auth で照合 → JWT生成
                       ↓  アクセス1日 / リフレッシュ1日 (remember_me時はどちらも30日)
                  (2FA有効時) → メール6桁コード検証 → トークン発行
                       ↓
                  httpOnly Cookie に access_token / refresh_token を保存 (XSS対策)
                       ↓
                  以降のリクエストは Cookie 自動送信 (Bearerヘッダーも併用可)

[リクエスト認証]
  Cookie(access_token) または Authorization: Bearer <JWT>
      ↓
  authenticateToken ミドルウェア
      ↓ JWT検証 → users(DB)から最新情報を取得し req.user に { id, role, agency } セット
      ↓ Cookie認証時は CSRF(Origin/Referer)検証。terminated/suspended は拒否
      ↓
  requireAdmin / requireAgency (ロール別ガード)

[トークン更新] POST /api/auth/refresh
  refresh_token 検証 → **DBから最新 role/状態を再取得**して新アクセストークンを発行
  (降格/無効化を反映。古いroleや期限を焼き直さない。期限は元セッションの remember_me を踏襲)
```

### ロール

| ロール | 権限 |
|-------|------|
| `admin` | 全データCRUD、代理店承認/却下、報酬計算/確定、監査ログ |
| `agency` | **自社+全子孫**のデータ閲覧、売上登録、請求書/領収書生成、自社情報のみ編集 |

---

## セキュリティ対策

### ミドルウェアスタック (適用順)

```
1. /health               ← セキュリティ前 (ヘルスチェック)
2. enforceHTTPS          ← 本番HTTPS強制
3. securityHeaders       ← helmet + カスタムヘッダー
4. ipBlocklist           ← IP遮断リスト
5. bruteForceProtection  ← ブルートフォース検知
6. CORS                  ← Origin制限 (localhost:3000/8000, Render)
7. globalApiRateLimiter  ← 全API: IPベース (認証前に動くためuser/admin除外は廃止)
8. cookieParser          ← httpOnly Cookie 読取
9. express.json          ← ボディパーサー (10MB上限)
10. loginRateLimiter     ← ログイン: 5回/15min ／ passwordReset 3回/1時間 ／ invitation 10回/1時間
11. sanitizeInput        ← XSS入力サニタイズ (token/code/secret/hash/signature は保全)
12. CSRF検証             ← Origin/Refererチェック (**test以外で常時**。Bearer認証は対象外)
```

### その他のセキュリティ施策

- **トークン保管**: access/refresh とも **httpOnly Cookie**（XSS対策、レスポンスbodyに含めない）。Secure/SameSite。
- **トークン有効期限**: アクセス1日 / リフレッシュ1日（remember_me 時は30日）。refresh 時に **DBの最新role/状態を再取得**して再発行（降格・無効化を反映）。
- **招待トークン**: `invitations.token` は **sha256(hex) ハッシュ保存**（平文はURLのみ・DB非保存）。set-password/reset と同方式。
- パスワード: 8文字以上, 大小英数字+記号, 類似性チェック（Supabase Auth管理）。
- 2FA: **メール6桁コード**（5分有効、ブルートフォース5回でロック）。
- **認可**: 認可キーは `agencies.user_id` を正とし、代理店スコープは「自分+全子孫」・fail-closed（未解決なら403、空フィルタを発行しない）。
- **冪等性/原子性**: 報酬計算・売上更新は RPC でトランザクション化。支払い確定は二重実行を防止。
- RLS(006): service_role運用のため最終防御層（詳細は「DB側ロジック」参照）。
- 監査ログ: 全変更操作を記録 (IP, UserAgent, before/after diff)。
- CSVサニタイズ: 数式インジェクション防止。
- ファイルアップロード: MIME制限 (JPEG/PNG/GIF/PDF), 10MB上限。

---

## 報酬計算エンジン

> **v2.0 方針（シナリオC）**: 旧「売上目標達成ボーナス（閾値で自動付与・ハードコード）」は廃止。
> ボーナスは **`campaigns` テーブルで設定するキャンペーン機能（`calculateCampaignBonusNew`）に一本化**し、
> 売上登録・手動/calculate・cron の全経路で同一ロジック（`normalizeCampaigns` 共有）を使う。

### 計算フロー

```
売上登録/月次計算 → 商品のTier別報酬率取得 → 基本報酬算出
              ↓
         階層ボーナス計算 (各上位代理店へ、上位tierの料率で還元 → 別レコードに計上)
              ↓
         キャンペーンボーナス (campaignsテーブル連動・売上単位。期間/対象商品/Tier/代理店/条件で判定)
              ↓
         インボイス未登録控除 (非登録事業者。控除率は設定値。2026/9まで2%, 10月以降は要設定)
              ↓
         源泉徴収 (個人事業主=外交員報酬モデル: 月次で「報酬合計−インボイス控除−月12万円」に
                  累進税率(〜100万 10.21% / 超過 20.42%)。基本+ボーナス全体が課税対象。法人は源泉なし)
              ↓
         最終金額 = 基本報酬 + 全ボーナス − インボイス控除 − 源泉徴収 （式A・下限0）
              ↓
         最低支払額判定 (設定値未満 → 当月分を繰越 carried_forward)
```

### 最終金額の統一式 (式A)

```
final_amount = base_amount + tier_bonus + campaign_bonus − invoice_deduction − withholding_tax   (≥ 0)
```
報酬画面・請求書・領収書・振込データはすべて保存済み `final_amount` を唯一の正とする。

### 階層ボーナス構造 (Tier1-5)

```
Tier 1 (直販代理店)        ← 商品別 tier1_commission_rate
  └─ Tier 2 (二次代理店)    ← tier2_commission_rate + 親(T1)が 2.0% ボーナス
       └─ Tier 3            ← tier3_commission_rate + 親(T2)が 1.5% ボーナス
            └─ Tier 4       ← tier4_commission_rate + 親(T3)が 1.0% ボーナス
                 └─ Tier 5  ← tier5_commission_rate + 親(T4)が 0.5% ボーナス
```
※ 子の tier は「親+1」を強制（飛び級なし）。料率は「もらう側(上位)の tier」で決定。ボーナス率は設定で変更可。

### 計算経路と整合性

| 経路 | 関数 | 確定済み(approved/paid)保護 | 原子性 |
|------|------|:--:|:--:|
| 売上登録/更新 | `calculateCommissionForSale` + `calculateCampaignBonusNew` | ○(更新時) | ○(`replace_sale_commissions`) |
| 手動 `/calculate` | `calculateMonthlyCommissions` | ○ | ○(`recalculate_commissions`) |
| cron 月次 | `calculateMonthlyCommissions` | ○ | ○(`recalculate_commissions`) |

---

## APIエンドポイント一覧

### 認証 (`/api/auth`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| POST | `/login` | - | ログイン |
| POST | `/logout` | JWT | ログアウト |
| POST | `/refresh` | - | トークン更新 |
| PUT | `/change-email` | JWT | メール変更 |
| PUT | `/change-password` | JWT | パスワード変更 |
| POST | `/reset-password-request` | - | リセット申請 |
| POST | `/reset-password` | - | パスワードリセット |
| POST | `/2fa/setup` | JWT | 2FA設定 |
| POST | `/2fa/verify` | JWT | 2FA検証 |

### 代理店 (`/api/agencies`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/` | JWT | 一覧取得 |
| POST | `/` | Admin | 新規作成 |
| GET | `/:id` | JWT | 詳細取得 |
| PUT | `/:id` | JWT | 更新 |
| PUT | `/:id/approve` | Admin | 承認 |
| PUT | `/:id/reject` | Admin | 却下 |
| PUT | `/:id/suspend` | Admin | 停止 |
| PUT | `/:id/reactivate` | Admin | 再開 |

### 売上 (`/api/sales`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/` | JWT | 一覧取得 |
| POST | `/` | JWT | 売上登録 |
| PUT | `/:id` | JWT | 売上更新 |
| DELETE | `/:id` | JWT | 売上削除 |
| GET | `/:id/history` | JWT | 変更履歴 |
| GET | `/anomalies` | Admin | 異常売上一覧 |
| PUT | `/:id/review` | Admin | 異常レビュー |
| GET | `/export` | JWT | CSVエクスポート |
| GET | `/summary` | JWT | サマリー |

### 報酬 (`/api/commissions`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/` | JWT | 一覧取得 (代理店は自社のみ・ページネーション) |
| GET | `/summary` | JWT | サマリー合計 (月指定=その月 / **未指定=全月集計**) |
| GET | `/export` | JWT | CSVエクスポート |
| POST | `/calculate` | Admin | 月次報酬計算 (RPCで原子的・確定済み保護) |
| PUT | `/:id/confirm` | Admin | 確定 |
| PUT | `/:id/approve` | Admin | 承認 |
| PUT | `/:id/pay` | Admin | 支払済 (payment_date/paid_at を分離記録) |
| PUT | `/:id/status` | Admin | ステータス更新 (+notes) |

### 請求書/領収書 (`/api/invoices`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/` | JWT | 請求書一覧 |
| GET | `/agencies` | Admin | 代理店一覧 (月次集計用) |
| POST | `/generate` | JWT | 請求書PDF生成 |
| POST | `/receipt` | JWT | 領収書PDF生成 |
| POST | `/generate-from-sale` | JWT | 売上ベース請求書PDF |
| POST | `/receipt-from-sale` | JWT | 売上ベース領収書PDF |
| POST | `/admin-monthly-summary` | Admin | 月次集計明細書PDF |
| POST | `/receipt-monthly` | JWT | 月次領収書PDF |

### その他
| Prefix | 主なエンドポイント |
|--------|------------------|
| `/api/products` | 商品CRUD |
| `/api/campaigns` | キャンペーンCRUD |
| `/api/payments` | 支払い処理・全銀出力 |
| `/api/documents` | 書類アップロード・承認 |
| `/api/document-recipients` | 宛先テンプレートCRUD |
| `/api/notifications` | 通知送信・履歴 |
| `/api/dashboard` | KPIデータ |
| `/api/network` | 階層ネットワークデータ |
| `/api/invitations` | 代理店招待 |
| `/api/audit-logs` | 監査ログ検索・CSV |
| `/api/commission-settings` | 報酬設定マスタ |

---

## フロントエンド構成

### SPA ページ遷移

```
index.html (単一HTML)
  ├── #login          ← ログイン画面
  ├── #two-factor     ← 2FA入力画面
  └── #app            ← メインアプリ
       ├── dashboard       ← KPIカード + チャート
       ├── agencies        ← 代理店一覧 + 詳細
       ├── sales           ← 売上管理
       ├── commissions     ← 報酬一覧
       ├── invoices        ← 請求書/領収書
       ├── products        ← 商品管理
       ├── campaigns       ← キャンペーン
       ├── documents       ← 書類管理
       ├── network         ← 3D階層ネットワーク (Three.js Force-Graph)
       ├── audit-logs      ← 監査ログ (Admin)
       ├── commission-settings ← 報酬設定 (Admin)
       └── settings        ← アカウント・会社情報
```

### API通信パターン

```javascript
// js/api/client.js - 共通HTTPクライアント
apiClient.get('/endpoint')     // GET + タイムスタンプキャッシュバスター
apiClient.post('/endpoint', body)  // POST + JSON
apiClient.put('/endpoint', body)
apiClient.delete('/endpoint')
apiClient.postForBlob('/endpoint', body)  // PDF受信用

// 自動処理:
// - Authorization: Bearer <token> ヘッダー付与
// - 401 TOKEN_EXPIRED → トークン削除 + ログイン画面遷移
// - 403 → { success: false } 返却
// - ネットワークエラー → 標準エラーオブジェクト
```

---

## テスト構成

### 統計

| 区分 | スイート | テスト数 |
|------|---------|---------|
| Backend (全体) | 34 | 449 (内 既存fail 7) |
| Frontend | 3 | 42 |
| **合計** | **37** | **~491** |

> 既存fail 7件（products/documents/middleware-auth/rateLimiter/auth-account）は v2.0 作業前から存在する既存failで、報酬・税務・セキュリティ改修とは無関係。改修した分のテストは全green。

### テストパターン

**Backend ルートテスト** (supertest):
```javascript
// 共通パターン: Supabaseチェーンモック + JWT認証モック
const mockSupabase = createSupabaseMock();  // from().select().eq()... チェーン
jest.mock('../../config/supabase', () => ({ supabase: mockSupabase }));
jest.mock('../../middleware/auth', () => ({ authenticateToken: /* JWT検証mock */ }));

// リクエスト
const res = await request(app).get('/api/endpoint')
  .set('Authorization', `Bearer ${token()}`);
expect(res.status).toBe(200);
```

**Frontend テスト** (jsdom):
```javascript
// Vanilla JSをnew Function()でロード → グローバルオブジェクト経由でテスト
const fn = new Function('window', 'CONFIG', 'localStorage', code);
fn(mockWindow, global.CONFIG, global.localStorage);
```

### カバレッジ主要数値 (Backend)

| 区分 | Statements |
|------|-----------|
| utils/ | 92.35% |
| routes/ (主要) | 40-88% |
| middleware/ | テスト済み |

---

## デプロイ

### インフラ構成

```
GitHub (main branch)
    │
    ├── Render: Backend (Auto-deploy)
    │   ├── Web Service: agenttree.onrender.com
    │   ├── Node.js 18+
    │   ├── Start: node server.js
    │   └── Environment Variables (.env)
    │
    └── Render: Frontend (Static Site)
        ├── agenttree-frontend.onrender.com
        └── Static files (HTML/CSS/JS)

Supabase
    ├── PostgreSQL Database
    └── Storage (書類ファイル)
```

### 環境変数

```bash
# 必須 (起動時検証)
JWT_SECRET=                      # JWT署名キー
JWT_REFRESH_SECRET=              # リフレッシュトークン署名キー
SUPABASE_URL=                    # Supabase URL
SUPABASE_SERVICE_KEY=            # Supabase Service Role Key

# オプション
PORT=3001                        # サーバーポート
NODE_ENV=production              # 環境
FRONTEND_URL=                    # CORS許可オリジン
RESEND_API_KEY=                  # メール送信
ENABLE_EMAIL=true                # メール送信有効化
ENABLE_SCHEDULER=true            # スケジューラー有効化
INVOICE_REGISTRATION_NUMBER=     # 運営側インボイス登録番号
RATE_LIMIT_WINDOW_MS=900000      # レート制限ウィンドウ
RATE_LIMIT_MAX_REQUESTS=100      # レート制限最大リクエスト数
```

### ヘルスチェック

```
GET /health → { status: "OK", timestamp: "...", db: "connected" }
```

---

## 主要な設計判断

| 判断 | 理由 |
|------|------|
| Vanilla JS (フレームワークなし) | 軽量、依存ゼロ、学習コスト低 |
| Supabase | PostgreSQL + 認証 + ストレージ統合、無料枠あり |
| JWT (localStorage保存) | SPAでの認証、サーバーステートレス |
| PDFKit (サーバーサイド生成) | ブラウザ依存なし、一貫したPDF出力 |
| JSONB (bank_account等) | スキーマ柔軟性、PostgreSQLネイティブ |
| 監査ログ (非同期) | パフォーマンス影響を最小化 |
| 全銀フォーマット対応 | 日本の銀行振込に対応 |
| 報酬計算の繰越機能 | 最低支払額未満の月次繰越 |
| **キャンペーン一本化(シナリオC, v2.0)** | 設定不能な閾値ボーナスを廃止し、設定可能なキャンペーン機能に統一。二重計上/水増し/経路差を解消 |
| **源泉=外交員報酬モデル(v2.0)** | 月12万円控除+100万円超20.42%累進。率は全て設定値化（税制改正に追従可能） |
| **最終金額の統一式A(v2.0)** | 報酬/請求書/振込の式不一致を解消し `final_amount` を単一の正に |
| **httpOnly Cookie認証(v2.0)** | localStorage保管をやめXSSリスクを低減。refresh時にDB role再取得で降格を反映 |
| **DBトリガーで階層自動繰り上げ(v2.0)** | 中間代理店削除時に配下を祖父へ繋ぎ替え+tier繰り上げ。削除経路に依存せず整合 |
| **報酬の原子化RPC(v2.0)** | DELETE+INSERTを単一トランザクション化し当月報酬の消失/部分更新を防止 |
