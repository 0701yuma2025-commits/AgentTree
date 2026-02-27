# Agency System v2 - システムアーキテクチャドキュメント

## 目次
1. [システム概要](#1-システム概要)
2. [技術スタック](#2-技術スタック)
3. [ディレクトリ構造](#3-ディレクトリ構造)
4. [データベース設計](#4-データベース設計)
5. [バックエンドアーキテクチャ](#5-バックエンドアーキテクチャ)
6. [フロントエンドアーキテクチャ](#6-フロントエンドアーキテクチャ)
7. [認証・セキュリティ](#7-認証セキュリティ)
8. [コミッション計算エンジン](#8-コミッション計算エンジン)
9. [自動化・バッチ処理](#9-自動化バッチ処理)
10. [API設計](#10-api設計)
11. [デプロイメント](#11-デプロイメント)
12. [データフロー図](#12-データフロー図)

---

## 1. システム概要

### 1.1 システムの目的
Agency System v2は、多階層販売代理店ネットワークを管理するための包括的なプラットフォームです。

### 1.2 主要機能
| 機能カテゴリ | 機能 |
|-------------|------|
| 代理店管理 | 4階層の代理店構造、招待制登録、承認ワークフロー |
| 売上管理 | 売上記録、集計、レポート生成 |
| コミッション計算 | 階層別料率、階層ボーナス、キャンペーン連動、源泉徴収 |
| 請求書発行 | PDF生成、QRコード埋め込み、テンプレート管理 |
| 決済管理 | 支払いスケジュール、銀行振込ファイル生成 |
| 監査ログ | 全操作の追跡、CSV出力、統計分析 |
| ネットワーク可視化 | 3D階層構造表示（Three.js） |

### 1.3 ユーザーロール
```
┌─────────────┬────────────────────────────────────────────┐
│ ロール      │ 権限                                       │
├─────────────┼────────────────────────────────────────────┤
│ admin       │ 全機能アクセス、システム設定、全代理店管理 │
│ agency      │ 自身と下位代理店の管理、売上・コミッション閲覧 │
│ viewer      │ 閲覧のみ                                   │
└─────────────┴────────────────────────────────────────────┘
```

---

## 2. 技術スタック

### 2.1 バックエンド
```
┌─────────────────────────────────────────────────────────┐
│                    Backend Stack                        │
├─────────────────────────────────────────────────────────┤
│  Runtime      │ Node.js v18+                            │
│  Framework    │ Express.js 4.18.2                       │
│  Database     │ PostgreSQL (Supabase)                   │
│  Auth         │ JWT (jsonwebtoken 9.0.2) + Supabase Auth│
│  2FA          │ Speakeasy 2.0.0 (TOTP)                  │
│  Validation   │ express-validator 7.0.1                 │
│  Security     │ helmet 7.1.0, bcrypt 6.0.0              │
│  Rate Limit   │ express-rate-limit 7.1.5                │
│  PDF生成      │ pdfkit 0.17.2                           │
│  QRコード     │ qrcode 1.5.3                            │
│  スケジューラ │ node-cron 4.2.1                         │
│  メール       │ Resend 6.1.0                            │
│  キャッシュ   │ ioredis 5.8.0 (オプション)              │
│  CSV出力      │ json2csv 6.0.0-alpha.2                  │
│  文字コード   │ iconv-lite 0.7.0                        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 フロントエンド
```
┌─────────────────────────────────────────────────────────┐
│                   Frontend Stack                        │
├─────────────────────────────────────────────────────────┤
│  言語         │ Pure JavaScript (ES6+)                  │
│  スタイル     │ CSS3 (カスタムプロパティ)               │
│  HTTP通信     │ Fetch API                               │
│  状態管理     │ LocalStorage + カスタム実装             │
│  3D描画       │ Three.js (CDN)                          │
│  グラフ       │ Chart.js (CDN)                          │
│  ビルドツール │ なし（静的ファイル配信）                │
└─────────────────────────────────────────────────────────┘
```

### 2.3 インフラストラクチャ
```
┌─────────────────────────────────────────────────────────┐
│                   Infrastructure                        │
├─────────────────────────────────────────────────────────┤
│  データベース │ Supabase (PostgreSQL + 認証 + Storage)  │
│  ホスティング │ Render.com                              │
│  Redis        │ オプション（レート制限用）              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. ディレクトリ構造

```
agency-system-v2/
│
├── backend/                          # バックエンドアプリケーション
│   ├── server.js                     # エントリーポイント
│   ├── package.json                  # 依存関係定義
│   ├── .env.example                  # 環境変数テンプレート
│   │
│   └── src/
│       ├── config/
│       │   └── supabase.js           # Supabaseクライアント初期化
│       │
│       ├── middleware/
│       │   ├── auth.js               # JWT認証・ロールベースアクセス制御
│       │   ├── security.js           # セキュリティヘッダー・入力検証
│       │   ├── advancedRateLimit.js  # 多層レート制限
│       │   ├── rateLimiter.js        # エンドポイント別レート制限
│       │   └── auditLog.js           # 監査ログ記録
│       │
│       ├── routes/                   # APIエンドポイント（16ファイル）
│       │   ├── auth.js               # 認証関連
│       │   ├── agencies.js           # 代理店管理
│       │   ├── sales.js              # 売上管理
│       │   ├── commissions.js        # コミッション管理
│       │   ├── invoices.js           # 請求書生成
│       │   ├── products.js           # 商品管理
│       │   ├── campaigns.js          # キャンペーン管理
│       │   ├── network.js            # ネットワーク可視化データ
│       │   ├── audit-logs.js         # 監査ログ
│       │   ├── document-recipients.js # 書類送付先テンプレート
│       │   ├── commission-settings.js # コミッション設定
│       │   ├── notifications.js      # 通知管理
│       │   ├── payments.js           # 決済処理
│       │   ├── documents.js          # ドキュメント管理
│       │   ├── dashboard.js          # ダッシュボード集計
│       │   └── invitations.js        # 招待管理
│       │
│       ├── services/
│       │   └── emailService.js       # メール送信サービス
│       │
│       ├── scripts/
│       │   └── cron-scheduler.js     # 定期実行タスク
│       │
│       └── utils/
│           ├── calculateCommission.js # コミッション計算エンジン
│           ├── ageValidator.js       # 年齢確認（18歳以上）
│           ├── generateCode.js       # コード生成
│           ├── emailSender.js        # メール送信
│           ├── anomalyDetection.js   # 異常検知
│           ├── bankExport.js         # 銀行振込ファイル生成
│           ├── passwordValidator.js  # パスワード強度検証
│           ├── twoFactor.js          # 2FA関連処理
│           └── pdf-generator.js      # PDF生成
│
├── frontend/                         # フロントエンドアプリケーション
│   ├── index.html                    # SPAシェル
│   │
│   ├── js/
│   │   ├── app.js                    # メインアプリケーション
│   │   ├── config.js                 # 設定
│   │   ├── supabase-client.js        # Supabaseクライアント
│   │   │
│   │   ├── api/                      # APIクライアント
│   │   │   ├── client.js             # ベースクライアント（シングルトン）
│   │   │   └── ...                   # 各種APIクライアント
│   │   │
│   │   ├── pages/                    # ページコントローラー
│   │   │   └── ...                   # 各ページモジュール
│   │   │
│   │   ├── components/               # 再利用可能UIコンポーネント
│   │   │
│   │   └── utils/                    # ユーティリティ関数
│   │
│   └── css/
│       ├── style.css                 # メインスタイル
│       └── modal.css                 # モーダルスタイル
│
├── database/                         # データベーススキーマ・マイグレーション
│   ├── schema.sql                    # 基本スキーマ
│   ├── seed.sql                      # 初期データ
│   ├── add-bank-tax-fields.sql       # 銀行・税務フィールド追加
│   ├── add-commission-fields.sql     # コミッションフィールド追加
│   ├── alter-products-table.sql      # 商品テーブル拡張
│   ├── create-audit-logs.sql         # 監査ログテーブル
│   ├── add-2fa-columns.sql           # 2FAカラム追加
│   └── ...                           # その他マイグレーション（29ファイル）
│
└── docs/
    ├── README.md
    ├── PROJECT_STRUCTURE.md
    ├── FEATURE_DOCUMENT_RECIPIENTS.md
    └── TODO_REQUIREMENTS.md
```

---

## 4. データベース設計

### 4.1 ER図（主要エンティティ）
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE SCHEMA                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ┌──────────────┐
                                    │    users     │
                                    ├──────────────┤
                                    │ id (UUID)    │
                                    │ email        │
                                    │ password_hash│
                                    │ role         │
                                    │ is_active    │
                                    │ created_at   │
                                    └──────┬───────┘
                                           │
                                           │ 1:1
                                           ▼
┌─────────────────┐               ┌──────────────────┐               ┌─────────────────┐
│   invitations   │──────────────▶│     agencies     │◀──────────────│    products     │
├─────────────────┤   creates     ├──────────────────┤   sold_by     ├─────────────────┤
│ id (UUID)       │               │ id (UUID)        │               │ id (UUID)       │
│ email           │               │ agency_code      │               │ product_code    │
│ inviter_agency_id│              │ company_name     │               │ name            │
│ token           │               │ tier_level (1-4) │               │ category        │
│ tier_level      │               │ parent_agency_id │───┐           │ price           │
│ expires_at      │               │ status           │   │ self-ref  │ tier1_commission│
└─────────────────┘               │ bank_account(JSON)│◀──┘          │ tier2_commission│
                                  │ tax_info (JSON)  │               │ tier3_commission│
                                  │ company_type     │               │ tier4_commission│
                                  └────────┬─────────┘               └─────────────────┘
                                           │
                                           │ 1:N
                                           ▼
                                  ┌──────────────────┐
                                  │      sales       │
                                  ├──────────────────┤
                                  │ id (UUID)        │
                                  │ sale_number      │
                                  │ agency_id        │───────────────┐
                                  │ product_id       │               │
                                  │ total_amount     │               │
                                  │ sale_date        │               │
                                  │ status           │               │
                                  └────────┬─────────┘               │
                                           │                         │
                                           │ 1:N                     │
                                           ▼                         │
                                  ┌──────────────────┐               │
                                  │   commissions    │◀──────────────┘
                                  ├──────────────────┤
                                  │ id (UUID)        │
                                  │ agency_id        │
                                  │ sale_id          │
                                  │ month (YYYY-MM)  │
                                  │ base_amount      │
                                  │ tier_bonus       │
                                  │ campaign_bonus   │
                                  │ withholding_tax  │
                                  │ final_amount     │
                                  │ status           │
                                  └──────────────────┘

        ┌────────────────┐        ┌────────────────┐        ┌────────────────────┐
        │   campaigns    │        │  audit_logs    │        │ document_recipients│
        ├────────────────┤        ├────────────────┤        ├────────────────────┤
        │ id (UUID)      │        │ id (UUID)      │        │ id (UUID)          │
        │ name           │        │ user_id        │        │ agency_id          │
        │ bonus_rate     │        │ action         │        │ recipient_name     │
        │ bonus_amount   │        │ resource_type  │        │ postal_code        │
        │ target_tier_   │        │ resource_id    │        │ address            │
        │   levels[]     │        │ ip_address     │        │ is_default         │
        │ conditions     │        │ details (JSON) │        │ last_used_at       │
        │ start_date     │        │ created_at     │        └────────────────────┘
        │ end_date       │        └────────────────┘
        └────────────────┘

        ┌────────────────────┐    ┌────────────────┐        ┌────────────────────┐
        │commission_settings │    │ notifications  │        │  payment_history   │
        ├────────────────────┤    ├────────────────┤        ├────────────────────┤
        │ id (UUID)          │    │ id (UUID)      │        │ id (UUID)          │
        │ tier1_base_rate    │    │ user_id        │        │ agency_id          │
        │ tier2_base_rate    │    │ title          │        │ amount             │
        │ tier3_base_rate    │    │ message        │        │ payment_method     │
        │ tier4_base_rate    │    │ type           │        │ reference_number   │
        │ tier1_from_tier2   │    │ read           │        │ status             │
        │ tier2_from_tier3   │    │ created_at     │        │ payment_date       │
        │ tier3_from_tier4   │    └────────────────┘        └────────────────────┘
        │ withholding_rate   │
        │ min_payment_amount │
        └────────────────────┘
```

### 4.2 主要テーブル詳細

#### users（ユーザー）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー（自動生成） |
| email | VARCHAR(255) | メールアドレス（ユニーク） |
| password_hash | TEXT | bcryptハッシュ化パスワード |
| full_name | VARCHAR(255) | 氏名 |
| phone | VARCHAR(20) | 電話番号 |
| role | VARCHAR(50) | ロール（admin/agency/viewer） |
| is_active | BOOLEAN | アクティブ状態 |
| last_login_at | TIMESTAMP | 最終ログイン日時 |

#### agencies（代理店）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| user_id | UUID | 紐づくユーザーID |
| agency_code | VARCHAR(50) | 自動生成のユニークコード |
| company_name | VARCHAR(255) | 会社名/代理店名 |
| representative_name | VARCHAR(255) | 代表者名 |
| tier_level | INTEGER(1-4) | 階層レベル |
| parent_agency_id | UUID | 親代理店（自己参照） |
| status | VARCHAR(50) | pending/active/suspended |
| company_type | VARCHAR(20) | 法人/個人 |
| bank_account | JSONB | 銀行口座情報 |
| tax_info | JSONB | 税務情報 |
| withholding_tax_flag | BOOLEAN | 源泉徴収対象フラグ |
| birth_date | DATE | 生年月日（18歳以上確認用） |
| invoice_number | VARCHAR(50) | インボイス登録番号 |

#### bank_account JSONB構造
```json
{
  "bank_name": "三菱UFJ銀行",
  "branch_name": "新宿支店",
  "account_type": "普通",
  "account_number": "1234567",
  "account_holder": "カブシキガイシャ エービーシー"
}
```

#### tax_info JSONB構造
```json
{
  "tax_id": "1234567890123",
  "tax_office": "新宿税務署",
  "invoice_registered": true,
  "fiscal_year_end": "03-31"
}
```

#### products（商品）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| product_code | VARCHAR(50) | 商品コード（自動採番PRD00000001形式） |
| name | VARCHAR(255) | 商品名 |
| description | TEXT | 説明 |
| price | DECIMAL(12,2) | 価格 |
| category | VARCHAR(100) | カテゴリ |
| tier1_commission_rate | DECIMAL(5,2) | Tier1報酬率（デフォルト10%） |
| tier2_commission_rate | DECIMAL(5,2) | Tier2報酬率（デフォルト8%） |
| tier3_commission_rate | DECIMAL(5,2) | Tier3報酬率（デフォルト6%） |
| tier4_commission_rate | DECIMAL(5,2) | Tier4報酬率（デフォルト4%） |
| is_active | BOOLEAN | 有効フラグ |

#### sales（売上）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| sale_number | VARCHAR(50) | 売上番号（自動採番） |
| agency_id | UUID | 代理店ID |
| product_id | UUID | 商品ID |
| customer_name | VARCHAR(255) | 顧客名 |
| sale_date | DATE | 売上日 |
| quantity | INTEGER | 数量 |
| unit_price | DECIMAL(12,2) | 単価 |
| total_amount | DECIMAL(12,2) | 合計金額 |
| status | VARCHAR(50) | pending/confirmed/cancelled |

#### commissions（コミッション）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| agency_id | UUID | 代理店ID |
| sale_id | UUID | 売上ID（NULL可：月次集計用） |
| month | VARCHAR(7) | 対象月（YYYY-MM形式） |
| tier_level | INTEGER | 階層レベル |
| base_amount | DECIMAL(12,2) | 基本コミッション額 |
| tier_bonus | DECIMAL(12,2) | 階層ボーナス額 |
| campaign_bonus | DECIMAL(12,2) | キャンペーンボーナス額 |
| withholding_tax | DECIMAL(12,2) | 源泉徴収税額 |
| final_amount | DECIMAL(12,2) | 最終支払額 |
| status | VARCHAR(50) | pending/confirmed/carried_forward/paid |
| carry_forward_reason | TEXT | 繰越理由 |
| payment_date | DATE | 支払日 |

### 4.3 インデックス設計
```sql
-- 代理店関連
CREATE INDEX idx_agencies_parent_id ON agencies(parent_agency_id);
CREATE INDEX idx_agencies_tier_level ON agencies(tier_level);
CREATE INDEX idx_agencies_status ON agencies(status);
CREATE INDEX idx_agencies_company_type ON agencies(company_type);
CREATE INDEX idx_agencies_invoice_number ON agencies(invoice_number);

-- 売上関連
CREATE INDEX idx_sales_agency_id ON sales(agency_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);

-- コミッション関連
CREATE INDEX idx_commissions_agency_id ON commissions(agency_id);
CREATE INDEX idx_commissions_month ON commissions(month);
CREATE INDEX idx_commissions_agency_month ON commissions(agency_id, month);
CREATE INDEX idx_commissions_status ON commissions(status);

-- 招待関連
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);

-- 商品関連
CREATE INDEX idx_products_product_code ON products(product_code);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active);
```

---

## 5. バックエンドアーキテクチャ

### 5.1 リクエストフロー
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   Client Request
        │
        ▼
┌───────────────────┐
│   Express.js      │
│   (server.js)     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         MIDDLEWARE STACK (順序通り)                        │
├───────────────────────────────────────────────────────────────────────────┤
│  1. enforceHTTPS        - HTTPS強制（本番環境）                           │
│  2. securityHeaders     - セキュリティヘッダー（Helmet）                  │
│  3. ipBlocklist         - IPブロックリスト                                │
│  4. bruteForceProtection- ブルートフォース対策                            │
│  5. cors()              - CORS設定                                        │
│  6. globalApiRateLimiter- API全体のレート制限                             │
│  7. 特定エンドポイント用レート制限                                        │
│     - loginRateLimiter (/api/auth/login)                                  │
│     - passwordResetRateLimiter (/api/auth/reset-password-request)         │
│     - invitationRateLimiter (/api/invitations)                            │
│  8. express.json()      - JSONパーサー（10MB制限）                        │
│  9. sanitizeInput       - 入力サニタイズ                                  │
│ 10. preventSQLInjection - SQLインジェクション防止                         │
└─────────┬─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           ROUTE LAYER (16モジュール)                       │
├───────────────────────────────────────────────────────────────────────────┤
│  /api/auth/*              - 認証エンドポイント                            │
│  /api/agencies/*          - 代理店管理                                    │
│  /api/sales/*             - 売上管理                                      │
│  /api/commissions/*       - コミッション管理                              │
│  /api/invoices/*          - 請求書生成                                    │
│  /api/products/*          - 商品管理                                      │
│  /api/campaigns/*         - キャンペーン管理                              │
│  /api/network/*           - ネットワークデータ                            │
│  /api/audit-logs/*        - 監査ログ                                      │
│  /api/document-recipients/* - 書類送付先                                  │
│  /api/commission-settings/* - コミッション設定                            │
│  /api/notifications/*     - 通知                                          │
│  /api/payments/*          - 決済処理                                      │
│  /api/documents/*         - ドキュメント                                  │
│  /api/dashboard/*         - ダッシュボード                                │
│  /api/invitations/*       - 招待                                          │
└─────────┬─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          UTILITY / SERVICE LAYER                           │
├───────────────────────────────────────────────────────────────────────────┤
│  utils/calculateCommission.js - コミッション計算ロジック                   │
│  services/emailService.js     - メール送信                                 │
│  utils/bankExport.js          - 銀行振込ファイル生成                       │
│  utils/pdf-generator.js       - PDF生成                                    │
│  utils/anomalyDetection.js    - 異常検知                                   │
└─────────┬─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         DATA ACCESS LAYER                                  │
├───────────────────────────────────────────────────────────────────────────┤
│  Supabase Client (config/supabase.js)                                     │
│  - PostgreSQL接続                                                         │
│  - 認証管理                                                               │
│  - ストレージ管理                                                         │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.2 ミドルウェア詳細

#### security.js
```javascript
// 提供する機能
module.exports = {
  enforceHTTPS,      // 本番環境でHTTPS強制
  securityHeaders,   // Helmetによるセキュリティヘッダー設定
  sanitizeInput,     // 入力値からHTMLタグを除去
  preventSQLInjection, // SQLインジェクションパターン検知
  ipBlocklist        // IPブロックリスト管理
};
```

#### advancedRateLimit.js
```javascript
// 提供する機能
module.exports = {
  loginRateLimiter,         // ログイン: 5回/15分
  invitationRateLimiter,    // 招待: 10回/1時間
  globalApiRateLimiter,     // API全体: 100回/15分
  passwordResetRateLimiter, // パスワードリセット: 制限あり
  bruteForceProtection      // アカウントロックアウト
};
```

---

## 6. フロントエンドアーキテクチャ

### 6.1 アプリケーション構造
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND ARCHITECTURE (SPA)                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           index.html (SPA Shell)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────────────────────────────────────┐ │
│  │   Sidebar    │  │                  Main Content Area                   │ │
│  │   Navigation │  │  各ページはCSSで hidden/shown を切り替え             │ │
│  │              │  │                                                      │ │
│  │  - Dashboard │  │  ┌────────────────────────────────────────────────┐ │ │
│  │  - Agencies  │  │  │  Active Page Content                          │ │ │
│  │  - Sales     │  │  │  (JavaScript で動的に制御)                     │ │ │
│  │  - Commission│  │  │                                                │ │ │
│  │  - Network   │  │  └────────────────────────────────────────────────┘ │ │
│  │  - Audit Log │  │                                                      │ │
│  │  - Settings  │  │                                                      │ │
│  └──────────────┘  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 JavaScript モジュール構成
```
app.js (メインコントローラー)
    │
    ├── config.js                    # API URL, ストレージキー等
    │
    ├── supabase-client.js           # Supabaseクライアント
    │
    ├── api/
    │   └── client.js                # APIクライアント（シングルトン）
    │       - fetch wrapper
    │       - Authorization ヘッダー自動付与
    │       - 401/403 でログインへリダイレクト
    │       - エラーハンドリング
    │
    ├── pages/                       # ページコントローラー
    │   ├── dashboard.js             # ダッシュボード
    │   ├── agencies.js              # 代理店管理
    │   ├── sales.js                 # 売上管理
    │   ├── commissions.js           # コミッション
    │   ├── network.js               # 3Dネットワーク (Three.js)
    │   ├── audit-logs.js            # 監査ログ
    │   └── settings.js              # 設定
    │
    ├── components/                  # 再利用可能コンポーネント
    │
    └── utils/                       # ユーティリティ
```

### 6.3 状態管理
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STATE MANAGEMENT                                    │
└─────────────────────────────────────────────────────────────────────────────┘

LocalStorage
    ├── auth_token          # JWTアクセストークン
    ├── refresh_token       # リフレッシュトークン
    ├── user_info           # ユーザー情報（JSON）
    └── preferences         # ユーザー設定

メモリ内状態
    ├── currentPage         # 現在表示中のページ
    ├── tableData           # テーブルデータキャッシュ
    ├── filters             # フィルター条件
    └── pagination          # ページネーション状態
```

---

## 7. 認証・セキュリティ

### 7.1 認証フロー
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

【ログインフロー】

    Client                    Backend                   Supabase
      │                         │                         │
      │ POST /api/auth/login    │                         │
      │ {email, password}       │                         │
      │────────────────────────>│                         │
      │                         │                         │
      │                         │ 認証リクエスト           │
      │                         │────────────────────────>│
      │                         │                         │
      │                         │ 認証結果                │
      │                         │<────────────────────────│
      │                         │                         │
      │                         │ 2FA有効チェック          │
      │                         │                         │
      │ (2FA有効の場合)         │                         │
      │ {requires_2fa: true}    │                         │
      │<────────────────────────│                         │
      │                         │                         │
      │ POST /api/auth/verify-2fa                         │
      │ {token, code}           │                         │
      │────────────────────────>│                         │
      │                         │                         │
      │ {access_token,          │                         │
      │  refresh_token,         │                         │
      │  user}                  │                         │
      │<────────────────────────│                         │
```

### 7.2 JWTトークン
```javascript
// ペイロード構造
{
    "sub": "user-uuid",           // ユーザーID
    "email": "user@example.com",  // メールアドレス
    "role": "agency",             // ロール
    "agency_id": "agency-uuid",   // 所属代理店ID
    "iat": 1234567890,            // 発行日時
    "exp": 1234567890 + 604800    // 有効期限（7日）
}

// トークン有効期限
// - アクセストークン: 7日
// - リフレッシュトークン: 30日
```

### 7.3 ロールベースアクセス制御（RBAC）
```
┌────────────┬─────────────┬─────────────┬─────────────┐
│ リソース    │   admin     │   agency    │   viewer    │
├────────────┼─────────────┼─────────────┼─────────────┤
│ 全代理店   │ CRUD        │ -           │ -           │
│ 自社代理店 │ CRUD        │ RU          │ R           │
│ 下位代理店 │ CRUD        │ CR          │ R           │
│ 売上       │ CRUD        │ CRU(自社)   │ R           │
│ コミッション│ CRUD       │ R(自社)     │ R           │
│ 商品       │ CRUD        │ R           │ R           │
│ キャンペーン│ CRUD       │ R           │ R           │
│ 監査ログ   │ R           │ R(自社)     │ -           │
│ 設定       │ CRUD        │ -           │ -           │
│ 招待       │ CRUD        │ C(下位のみ) │ -           │
└────────────┴─────────────┴─────────────┴─────────────┘

C=Create, R=Read, U=Update, D=Delete
```

### 7.4 セキュリティ対策一覧
```
【認証・認可】
├── JWT認証（ステートレス）
├── 2要素認証（TOTP - Speakeasy）
├── パスワードハッシュ化（bcrypt）
├── トークンリフレッシュ機構
└── ロールベースアクセス制御

【通信】
├── HTTPS強制（本番環境）
├── CORS設定（ホワイトリスト方式）
│   - http://localhost:3000
│   - http://localhost:8000
│   - https://agenttree-frontend.onrender.com
└── セキュリティヘッダー（Helmet.js）

【入力検証】
├── express-validator による検証
├── HTMLタグサニタイズ
├── SQLインジェクション防止（パターン検知）
└── リクエストサイズ制限（10MB）

【レート制限】
├── ログイン: 5回/15分
├── パスワードリセット: 制限あり
├── 招待送信: 10回/1時間
├── API全体: 100回/15分
└── Redis連携（分散環境対応・オプション）

【監査】
├── 全操作の監査ログ記録
├── IPアドレス記録
├── ユーザーエージェント記録
└── 操作詳細（JSON）記録
```

---

## 8. コミッション計算エンジン

### 8.1 デフォルト料率設定
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEFAULT COMMISSION RATES                                │
└─────────────────────────────────────────────────────────────────────────────┘

【基本コミッション率（Tier別）】
┌────────┬────────────────┐
│  Tier  │ デフォルト料率  │
├────────┼────────────────┤
│ Tier 1 │ 10.00%         │
│ Tier 2 │  8.00%         │
│ Tier 3 │  6.00%         │
│ Tier 4 │  4.00%         │
└────────┴────────────────┘

【階層ボーナス率（上位Tierが下位Tierの売上から受け取る）】
┌─────────────────────────┬────────────────┐
│  ボーナス対象            │ デフォルト料率  │
├─────────────────────────┼────────────────┤
│ Tier1 ← Tier2の売上     │ 2.0%           │
│ Tier2 ← Tier3の売上     │ 1.5%           │
│ Tier3 ← Tier4の売上     │ 1.0%           │
│ Tier4                   │ 0%（なし）     │
└─────────────────────────┴────────────────┘

【その他設定】
- インボイス未登録控除: 2.0%
- 源泉徴収率: 10.21%
- 最低支払額: ¥10,000
```

### 8.2 計算フロー
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   COMMISSION CALCULATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

入力: agency_id, month (YYYY-MM)

Step 1: 売上データ取得
┌─────────────────────────────────────────────────────────────────────────────┐
│ 対象月の確定済み売上（status = 'confirmed'）を取得                          │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Step 2: 基本コミッション計算
┌─────────────────────────────────────────────────────────────────────────────┐
│ 商品マスタの tier{N}_commission_rate を使用                                 │
│ （未設定の場合はデフォルト料率を適用）                                      │
│                                                                             │
│ base_amount = sale.total_amount × commission_rate / 100                    │
│ ※ 端数切り捨て（Math.floor）                                               │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Step 3: 階層ボーナス計算
┌─────────────────────────────────────────────────────────────────────────────┐
│ 親代理店チェーンを遡り、各親にボーナスを付与                                │
│                                                                             │
│ tier_bonus = sale.total_amount × hierarchy_bonus_rate / 100                │
│                                                                             │
│ ※ 親代理店にはtier_bonus付きの別レコードを作成                            │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Step 4: キャンペーンボーナス適用
┌─────────────────────────────────────────────────────────────────────────────┐
│ 有効なキャンペーンの条件チェック:                                          │
│ - 期間（start_date <= sale_date <= end_date）                              │
│ - 対象商品                                                                 │
│ - 対象Tier                                                                 │
│ - 最小売上額                                                               │
│                                                                             │
│ ボーナスタイプ:                                                            │
│ - percentage: sale.total_amount × bonus_value / 100                        │
│ - fixed: bonus_value（固定額）                                             │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Step 5: 控除計算
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【インボイス未登録控除】                                                    │
│ if (!agency.invoice_registered):                                            │
│   invoice_deduction = base_amount × 2% (設定値)                            │
│                                                                             │
│ 【源泉徴収（個人事業主の場合）】                                            │
│ if (agency.company_type === '個人' || agency.withholding_tax_flag):        │
│   taxable = base_amount - invoice_deduction                                │
│   withholding_tax = taxable × 10.21%                                       │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Step 6: 最終金額計算 & 最低支払額チェック
┌─────────────────────────────────────────────────────────────────────────────┐
│ final_amount = base_amount                                                  │
│              + tier_bonus                                                   │
│              + campaign_bonus                                               │
│              - invoice_deduction                                            │
│              - withholding_tax                                              │
│                                                                             │
│ 【最低支払額チェック（代理店単位で集計）】                                  │
│ if (月次合計 < MIN_PAYMENT_AMOUNT):                                         │
│   status = 'carried_forward'                                                │
│   carry_forward_reason = '最低支払額未満'                                   │
└─────────────────────────────────────────────────────────────────────────────┘

出力: コミッションレコード（売上単位 + 親ボーナス単位）
```

### 8.3 計算例
```
【条件】
- Tier 3 代理店が ¥100,000 の売上を計上
- 商品のTier3報酬率: 6%
- 親代理店: Tier 2 (親ボーナス率 1.5%)
- 祖父代理店: Tier 1 (親ボーナス率 2.0%)
- 代理店は個人事業主（源泉徴収対象）

【計算結果】
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 3 代理店のコミッション                                                 │
│   base_amount = ¥100,000 × 6% = ¥6,000                                     │
│   withholding_tax = ¥6,000 × 10.21% = ¥612                                 │
│   final_amount = ¥6,000 - ¥612 = ¥5,388                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 2 親代理店の階層ボーナス                                               │
│   tier_bonus = ¥100,000 × 1.5% = ¥1,500                                    │
│   final_amount = ¥1,500                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tier 1 祖父代理店の階層ボーナス                                             │
│   tier_bonus = ¥100,000 × 2.0% = ¥2,000                                    │
│   final_amount = ¥2,000                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. 自動化・バッチ処理

### 9.1 npm scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "scheduler": "node src/scripts/cron-scheduler.js",
    "batch:monthly": "node src/scripts/batch-processor.js monthly-closing",
    "batch:commission": "node src/scripts/batch-processor.js calculate-commission",
    "batch:backup": "node src/scripts/batch-processor.js daily-backup",
    "batch:reminder": "node src/scripts/batch-processor.js payment-reminder",
    "batch:check": "node src/scripts/batch-processor.js integrity-check"
  }
}
```

### 9.2 定期実行スケジュール（cron-scheduler.js）
```
┌─────────────────┬───────────────────┬────────────────────────────────────────┐
│ 実行タイミング   │ cron式            │ 処理内容                              │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 月末 23:59      │ 59 23 L * *       │ 月次締め処理                          │
│                 │                   │ - 売上確定                            │
│                 │                   │ - 締め通知メール送信                  │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 毎月1日 02:00   │ 0 2 1 * *         │ コミッション自動計算                  │
│                 │                   │ - 全代理店のコミッション計算          │
│                 │                   │ - 結果保存                            │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 毎月20日 09:00  │ 0 9 20 * *        │ 支払いリマインダー                    │
│                 │                   │ - 代理店への支払い予定通知            │
│                 │                   │ - 銀行情報確認依頼                    │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 毎月25日 10:00  │ 0 10 25 * *       │ 支払い処理                            │
│                 │                   │ - 銀行振込ファイル生成                │
│                 │                   │ - ステータス更新                      │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 毎日 03:00      │ 0 3 * * *         │ 整合性チェック                        │
├─────────────────┼───────────────────┼────────────────────────────────────────┤
│ 毎日 04:00      │ 0 4 * * *         │ バックアップ                          │
└─────────────────┴───────────────────┴────────────────────────────────────────┘
```

### 9.3 月次処理フロー
```
    月末 23:59           1日 02:00           20日 09:00        25日 10:00
        │                    │                    │                  │
        ▼                    ▼                    ▼                  ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐       ┌─────────┐
   │ 月次締め │          │コミッション│        │リマインダー│     │ 支払い  │
   │ 処理    │─────────▶│ 計算    │─────────▶│ 送信    │──────▶│ 処理    │
   └─────────┘          └─────────┘          └─────────┘       └─────────┘
        │                    │                    │                  │
        ▼                    ▼                    ▼                  ▼
   売上ステータス        全代理店の             支払い予定        振込ファイル
   確定                  コミッション計算       通知メール        生成
```

---

## 10. API設計

### 10.1 エンドポイント一覧

#### 認証 `/api/auth`
| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | /login | ログイン |
| POST | /logout | ログアウト |
| POST | /refresh | トークンリフレッシュ |
| POST | /register | ユーザー登録（招待経由） |
| POST | /reset-password-request | パスワードリセット要求 |
| POST | /verify-2fa | 2要素認証検証 |
| POST | /setup-2fa | 2FA設定 |
| DELETE | /disable-2fa | 2FA無効化 |

#### 代理店 `/api/agencies`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | 代理店一覧 |
| GET | /:id | 代理店詳細 |
| POST | / | 代理店作成 |
| PUT | /:id | 代理店更新 |
| DELETE | /:id | 代理店削除 |
| PUT | /:id/approve | 代理店承認 |

#### 売上 `/api/sales`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | 売上一覧 |
| GET | /summary | 売上集計 |
| GET | /:id | 売上詳細 |
| POST | / | 売上登録 |
| PUT | /:id | 売上更新 |
| DELETE | /:id | 売上削除 |

#### コミッション `/api/commissions`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | コミッション一覧 |
| GET | /summary | コミッション集計 |
| POST | /calculate | コミッション計算実行 |
| PUT | /:id | ステータス更新 |

#### 請求書 `/api/invoices`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | 請求書一覧 |
| POST | /generate | PDF生成 |

#### 商品 `/api/products`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | 商品一覧 |
| POST | / | 商品作成 |
| PUT | /:id | 商品更新 |
| DELETE | /:id | 商品削除 |

#### キャンペーン `/api/campaigns`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | キャンペーン一覧 |
| POST | / | キャンペーン作成 |
| PUT | /:id | キャンペーン更新 |
| DELETE | /:id | キャンペーン削除 |

#### ネットワーク `/api/network`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | ネットワーク階層データ |

#### 監査ログ `/api/audit-logs`
| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | / | 監査ログ一覧 |
| GET | /stats/summary | 統計サマリー |
| GET | /export/csv | CSV出力 |

#### その他
| Endpoint | 説明 |
|----------|------|
| /api/document-recipients | 書類送付先テンプレート管理 |
| /api/commission-settings | コミッション設定 |
| /api/notifications | 通知管理 |
| /api/payments | 決済処理 |
| /api/documents | ドキュメント管理 |
| /api/dashboard | ダッシュボードデータ |
| /api/invitations | 招待管理 |
| /health | ヘルスチェック |

### 10.2 レスポンス形式
```javascript
// 成功レスポンス
{
    "success": true,
    "data": { ... },
    "meta": {
        "total": 100,
        "page": 1,
        "limit": 20
    }
}

// エラーレスポンス
{
    "error": true,
    "message": "エラーメッセージ",
    "details": [ ... ]  // バリデーションエラー時
}
```

### 10.3 HTTPステータスコード
| Code | 使用場面 |
|------|----------|
| 200 | 成功（GET, PUT, DELETE） |
| 201 | 作成成功（POST） |
| 400 | 不正なリクエスト |
| 401 | 認証エラー |
| 403 | 認可エラー |
| 404 | リソースが見つからない |
| 429 | レート制限超過 |
| 500 | サーバー内部エラー |

---

## 11. デプロイメント

### 11.1 環境構成
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │    Internet     │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              │                                                 │
              ▼                                                 ▼
    ┌──────────────────┐                             ┌──────────────────┐
    │    Frontend      │                             │     Backend      │
    │  (Render.com)    │                             │   (Render.com)   │
    │                  │                             │                  │
    │  Static Files    │──────── API Calls ────────▶│  Express.js      │
    │  Port: 3000/8000 │                             │  Port: 3001      │
    └──────────────────┘                             └────────┬─────────┘
                                                              │
                              ┌────────────────────────────────┤
                              │                                │
                              ▼                                ▼
                    ┌──────────────────┐             ┌──────────────────┐
                    │    Supabase      │             │     Redis        │
                    │                  │             │   (Optional)     │
                    │  PostgreSQL      │             │                  │
                    │  Auth            │             │  Rate Limiting   │
                    │  Storage         │             │                  │
                    └──────────────────┘             └──────────────────┘
```

### 11.2 環境変数
```bash
# .env.example

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://agenttree-frontend.onrender.com

# Redis (Optional)
REDIS_URL=redis://localhost:6379

# Email (Resend)
RESEND_API_KEY=re_xxxxxx
EMAIL_FROM=noreply@yourdomain.com

# Scheduler
ENABLE_SCHEDULER=true
```

### 11.3 本番URL
```
Frontend: https://agenttree-frontend.onrender.com
Backend:  https://agenttree.onrender.com
Health:   https://agenttree.onrender.com/health
```

### 11.4 CORS許可オリジン
```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8000',
  'https://agenttree-frontend.onrender.com'
];
```

---

## 12. データフロー図

### 12.1 売上登録フロー
```
    Agency User              Frontend               Backend                Database
        │                       │                      │                      │
        │ 1. 売上入力           │                      │                      │
        │──────────────────────>│                      │                      │
        │                       │                      │                      │
        │                       │ 2. POST /api/sales   │                      │
        │                       │─────────────────────>│                      │
        │                       │                      │                      │
        │                       │                      │ 3. バリデーション     │
        │                       │                      │    権限チェック       │
        │                       │                      │                      │
        │                       │                      │ 4. INSERT sales      │
        │                       │                      │─────────────────────>│
        │                       │                      │                      │
        │                       │                      │ 5. INSERT audit_logs │
        │                       │                      │─────────────────────>│
        │                       │                      │                      │
        │                       │ 6. 成功レスポンス    │                      │
        │                       │<─────────────────────│                      │
        │                       │                      │                      │
        │ 7. 完了表示           │                      │                      │
        │<──────────────────────│                      │                      │
```

### 12.2 代理店招待フロー
```
    Admin/Agency        Frontend          Backend           Email            New Agency
        │                  │                 │                │                  │
        │ 1. 招待入力      │                 │                │                  │
        │─────────────────>│                 │                │                  │
        │                  │                 │                │                  │
        │                  │ 2. POST /invite │                │                  │
        │                  │────────────────>│                │                  │
        │                  │                 │                │                  │
        │                  │                 │ 3. トークン生成│                  │
        │                  │                 │    レコード作成│                  │
        │                  │                 │                │                  │
        │                  │                 │ 4. メール送信  │                  │
        │                  │                 │───────────────>│                  │
        │                  │                 │                │                  │
        │                  │                 │                │ 5. 招待メール   │
        │                  │                 │                │─────────────────>│
        │                  │                 │                │                  │
        │                  │ 6. 完了通知     │                │                  │
        │<─────────────────│<────────────────│                │                  │
        │                  │                 │                │                  │
        │                  │                 │                │ 6. リンクClick  │
        │                  │                 │<───────────────────────────────────│
        │                  │                 │                │                  │
        │                  │                 │ 7. トークン検証│                  │
        │                  │                 │    登録フォーム│                  │
        │                  │                 │────────────────────────────────────>
        │                  │                 │                │                  │
        │                  │                 │ 8. 登録完了    │                  │
        │                  │                 │    代理店作成  │                  │
```

### 12.3 コミッション計算フロー（自動）
```
    Cron Scheduler      calculateCommission.js      Database           Email Service
        │                        │                     │                    │
        │ 1. 毎月1日 02:00       │                     │                    │
        │ 計算トリガー           │                     │                    │
        │───────────────────────>│                     │                    │
        │                        │                     │                    │
        │                        │ 2. 代理店一覧取得   │                    │
        │                        │────────────────────>│                    │
        │                        │                     │                    │
        │                        │ 3. 各代理店ループ   │                    │
        │                        │    売上データ取得   │                    │
        │                        │────────────────────>│                    │
        │                        │                     │                    │
        │                        │ 4. 計算処理         │                    │
        │                        │    - 基本コミッション│                   │
        │                        │    - 階層ボーナス   │                    │
        │                        │    - キャンペーン   │                    │
        │                        │    - 控除           │                    │
        │                        │                     │                    │
        │                        │ 5. コミッション保存 │                    │
        │                        │────────────────────>│                    │
        │                        │                     │                    │
        │                        │ 6. 完了通知         │                    │
        │                        │───────────────────────────────────────────>
        │                        │                     │                    │
        │ 7. 処理完了            │                     │                    │
        │<───────────────────────│                     │                    │
```

---

## 付録

### A. 用語集
| 用語 | 説明 |
|------|------|
| Tier | 代理店の階層レベル（1が最上位、4が最下位） |
| tier_level | データベース上のTier階層カラム名 |
| tier_bonus | 下位代理店の売上から上位代理店が受け取るボーナス |
| インボイス登録 | 適格請求書発行事業者としての登録有無 |
| 源泉徴収 | 個人事業主への支払い時に差し引く所得税（10.21%） |
| carried_forward | 最低支払額未満の場合に次月に持ち越す金額 |
| bank_account | 銀行口座情報（JSONB形式で格納） |
| tax_info | 税務情報（JSONB形式で格納） |

### B. ファイル命名規則
```
データベース:
  - schema.sql          : 基本スキーマ
  - add-*.sql           : カラム/テーブル追加マイグレーション
  - alter-*.sql         : テーブル変更マイグレーション
  - create-*.sql        : テーブル作成マイグレーション

バックエンド:
  - routes/*.js         : APIルートハンドラー
  - middleware/*.js     : ミドルウェア
  - utils/*.js          : ユーティリティ関数
  - services/*.js       : ビジネスロジックサービス
  - scripts/*.js        : バッチ処理スクリプト

フロントエンド:
  - pages/*.js          : ページコントローラー
  - api/*.js            : APIクライアント
  - components/*.js     : UIコンポーネント
  - utils/*.js          : ユーティリティ
```

### C. マイグレーション履歴（主要なもの）
| ファイル | 内容 |
|----------|------|
| schema.sql | 基本スキーマ（users, agencies, products, sales, commissions, invitations, campaigns, payment_history） |
| add-bank-tax-fields.sql | 銀行口座・税務情報フィールド追加 |
| add-commission-fields.sql | コミッション関連フィールド追加 |
| alter-products-table.sql | 商品テーブルにTier別報酬率追加 |
| create-audit-logs.sql | 監査ログテーブル作成 |
| add-2fa-columns.sql | 2FAカラム追加 |
| add-document-templates.sql | 書類テンプレートテーブル作成 |

### D. 参考リンク
- [Express.js Documentation](https://expressjs.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [JWT.io](https://jwt.io/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Chart.js Documentation](https://www.chartjs.org/docs/)

---

*このドキュメントは Agency System v2 のシステムアーキテクチャを包括的に記述したものです。*
*最終更新: 2026年1月*
