# AgentTree - システムアーキテクチャ

多段階営業代理店管理システム（Multi-tier Sales Agency Management System）

## 概要

営業代理店の階層管理・売上追跡・報酬計算・請求書/領収書発行を一元管理するWebアプリケーション。
最大4段階の代理店階層をサポートし、Tier別報酬・キャンペーンボーナス・源泉徴収・インボイス制度に対応。

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
| Frontend | Vanilla JavaScript (SPA) | ES2020+ |
| Backend | Node.js + Express | Node >=18, Express 4.18 |
| Database | Supabase (PostgreSQL) | supabase-js 2.39 |
| Auth | JWT (jsonwebtoken) | 9.0 |
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
│       │   ├── auth.js         # POST /login, /logout, /refresh-token
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
│   │   └── 001_add_operator_invoice_number.sql
│   └── README.md               # テストデータ構成
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
                          ├── agencies (self-ref: parent_agency_id) ← 最大4階層
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

### テーブル一覧 (15テーブル)

| テーブル | 概要 | 主なカラム |
|---------|------|-----------|
| `users` | ユーザー認証 | email, password_hash, role, 2FA fields |
| `agencies` | 代理店 | company_name, tier_level(1-4), parent_agency_id, bank_account(JSONB), invoice_number |
| `products` | 商品 | product_code, price, tier1~4_commission_rate |
| `sales` | 売上 | sale_number, agency_id, total_amount, anomaly_score |
| `commissions` | 報酬 | base_amount, tier_bonus, campaign_bonus, withholding_tax, final_amount, month |
| `commission_settings` | 報酬設定 | minimum_payment_amount, tier別ボーナス率, 源泉徴収率, インボイス控除率 |
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
- **自動トリガー**: `updated_at`自動更新、源泉徴収フラグ自動設定、通知設定自動作成
- **バリデーション制約**: 18歳以上、銀行口座JSONB構造、報酬率0-100%
- **JSONB活用**: bank_account, tax_info, metadata, conditions, changes

---

## 認証・認可フロー

```
[ログイン]
  Email + Password → POST /api/auth/login
                       ↓
                  bcrypt照合 → JWT生成 (7日) + RefreshToken (30日)
                       ↓
                  (2FA有効時) → TOTP検証 → トークン発行
                       ↓
                  localStorage保存 → 全APIリクエストに Bearer Token付与

[リクエスト認証]
  Authorization: Bearer <JWT>
      ↓
  authenticateToken ミドルウェア
      ↓ JWT検証 → req.user に { id, role, agency } セット
      ↓
  requireAdmin / requireAgency (ロール別ガード)
```

### ロール

| ロール | 権限 |
|-------|------|
| `admin` / `super_admin` | 全データCRUD、代理店承認/却下、報酬確定、監査ログ |
| `agency` | 自社+傘下のデータ閲覧、売上登録、請求書/領収書生成 |

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
7. globalApiRateLimiter  ← 全API: 100req/15min
8. loginRateLimiter      ← ログイン: 5回/15min
9. passwordResetRateLimiter ← リセット: 3回/1時間
10. express.json          ← ボディパーサー (10MB上限)
11. sanitizeInput         ← XSS入力サニタイズ
12. preventSQLInjection   ← SQLiパターン検出
13. CSRF検証              ← Origin/Refererチェック (本番のみ)
```

### その他のセキュリティ施策

- パスワード: bcrypt, 8文字以上, 大小英数字+記号, 類似性チェック
- 2FA: TOTP (Time-based One-Time Password)
- トークン: JWT有効期限7日, リフレッシュトークン30日
- 監査ログ: 全変更操作を記録 (IP, UserAgent, before/after diff)
- CSVサニタイズ: 数式インジェクション防止
- ファイルアップロード: MIME制限 (JPEG/PNG/GIF/PDF), 10MB上限

---

## 報酬計算エンジン

### 計算フロー

```
売上登録 → 商品のTier別報酬率取得 → 基本報酬算出
              ↓
         階層ボーナス計算 (親Tierから子Tierへの差分)
              ↓
         キャンペーンボーナス加算
              ↓
         インボイス未登録控除 (非登録事業者: 2%減額)
              ↓
         源泉徴収税計算 (個人事業者: 10.21%)
              ↓
         最低支払額判定 (¥10,000未満 → 繰越)
              ↓
         最終報酬額確定
```

### 階層ボーナス構造

```
Tier 1 (直販代理店)    ← 商品別 tier1_commission_rate
  └─ Tier 2 (二次代理店) ← tier2_commission_rate + 親からの 2.0% ボーナス
       └─ Tier 3          ← tier3_commission_rate + 親からの 1.5% ボーナス
            └─ Tier 4      ← tier4_commission_rate + 親からの 1.0% ボーナス
```

---

## APIエンドポイント一覧

### 認証 (`/api/auth`)
| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| POST | `/login` | - | ログイン |
| POST | `/logout` | JWT | ログアウト |
| POST | `/refresh-token` | - | トークン更新 |
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
| GET | `/` | JWT | 一覧取得 |
| POST | `/calculate` | Admin | 報酬計算実行 |

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
| Backend ルート | 17 | ~300 |
| Backend ユーティリティ | 12 | ~100 |
| Backend ミドルウェア | 3 | ~40 |
| Frontend | 3 | 42 |
| **合計** | **35** | **~486** |

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
