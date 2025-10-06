# 多段階営業代理店管理システム v2

## 概要

4層までの多段階構造をサポートする営業代理店管理システムです。
フロントエンドとバックエンドを分離したアーキテクチャで構築されています。

## 技術スタック

### バックエンド
- Node.js + Express
- Supabase (PostgreSQL + 認証)
- JWT認証

### フロントエンド
- 純粋なHTML/CSS/JavaScript
- レスポンシブデザイン

## セットアップ

### 1. 依存関係のインストール

```bash
# バックエンドの依存関係をインストール
cd backend
npm install
```

### 2. 環境変数の設定

```bash
# .envファイルを作成
cp .env.example .env
```

`.env`ファイルを編集し、Supabaseの情報を設定してください：

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
JWT_SECRET=your_jwt_secret
```

### 3. データベースセットアップ

1. Supabaseダッシュボードにログイン
2. SQL Editorで `database/schema.sql` の内容を実行
3. 初期データが必要な場合は `database/seed.sql` を実行

### 4. アプリケーションの起動

```bash
# バックエンドサーバーを起動
cd backend
npm run dev

# フロントエンドを起動（別ターミナル）
cd frontend
npx http-server -p 8000
```

ブラウザで http://localhost:8000 にアクセスしてください。

## 機能

### 代理店管理
- 4層までの階層構造
- 招待制による登録
- 代理店の承認フロー

### 売上管理
- 売上登録・管理
- 階層別の売上集計

### 報酬管理
- 自動報酬計算
- ティアボーナス
- キャンペーンボーナス

### セキュリティ
- JWT認証
- ロールベースアクセス制御
- レート制限

## APIエンドポイント

### 認証
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `POST /api/auth/refresh` - トークンリフレッシュ

### 代理店
- `GET /api/agencies` - 代理店一覧
- `GET /api/agencies/:id` - 代理店詳細
- `POST /api/agencies` - 代理店作成
- `PUT /api/agencies/:id` - 代理店更新
- `PUT /api/agencies/:id/approve` - 代理店承認

### 売上
- `GET /api/sales` - 売上一覧
- `GET /api/sales/summary` - 売上サマリー
- `POST /api/sales` - 売上登録

### 報酬
- `GET /api/commissions` - 報酬一覧
- `GET /api/commissions/summary` - 報酬サマリー

### 招待
- `GET /api/invitations` - 招待一覧
- `POST /api/invitations` - 招待作成
- `GET /api/invitations/validate` - 招待検証
- `POST /api/invitations/accept` - 招待承認

## データベース構造

詳細は `database/schema.sql` を参照してください。

主要テーブル:
- `users` - ユーザー情報
- `agencies` - 代理店情報
- `products` - 商品情報
- `sales` - 売上情報
- `commissions` - 報酬情報
- `invitations` - 招待情報
- `campaigns` - キャンペーン情報

## デフォルト管理者アカウント

メール: admin@example.com
パスワード: (データベース初期化時に設定)

## ライセンス

MIT