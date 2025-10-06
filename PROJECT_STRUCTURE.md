# プロジェクト構造

## ディレクトリ構成

```
agency-system-v2/
├── backend/          # バックエンドAPI (Node.js/Express)
│   ├── src/
│   │   ├── routes/   # APIエンドポイント
│   │   ├── controllers/  # ビジネスロジック
│   │   ├── models/   # データモデル
│   │   ├── middleware/  # 認証・認可など
│   │   └── utils/    # ユーティリティ関数
│   ├── package.json
│   └── server.js
│
├── frontend/         # フロントエンド (純粋なHTML/CSS/JS)
│   ├── public/       # 静的ファイル
│   ├── css/          # スタイルシート
│   ├── js/           # JavaScriptファイル
│   │   ├── api/      # API通信
│   │   ├── components/  # UIコンポーネント
│   │   └── utils/    # ユーティリティ
│   └── index.html    # メインページ
│
└── database/         # データベース設定
    ├── migrations/   # マイグレーションファイル
    ├── seeds/        # 初期データ
    └── schema.sql    # スキーマ定義
```

## 技術スタック

### バックエンド
- **言語**: Node.js (v18+)
- **フレームワーク**: Express.js
- **認証**: JWT (jsonwebtoken)
- **データベース**: Supabase (PostgreSQL)
- **バリデーション**: express-validator
- **CORS**: cors
- **環境変数**: dotenv

### フロントエンド
- **言語**: 純粋なJavaScript (ES6+)
- **スタイル**: CSS3 (CSSカスタムプロパティ使用)
- **ビルドツール**: なし（純粋な静的ファイル）
- **HTTP通信**: Fetch API
- **状態管理**: LocalStorage + カスタム実装

### データベース
- **Supabase**: PostgreSQL + リアルタイム機能
- **認証**: Supabase Auth
- **ストレージ**: Supabase Storage（将来的な拡張用）

## API設計方針

### RESTful API
```
GET    /api/agencies      # 代理店一覧取得
POST   /api/agencies      # 代理店作成
GET    /api/agencies/:id  # 代理店詳細取得
PUT    /api/agencies/:id  # 代理店更新
DELETE /api/agencies/:id  # 代理店削除

GET    /api/sales         # 売上一覧取得
POST   /api/sales         # 売上登録
GET    /api/commissions   # 報酬一覧取得
```

### 認証フロー
1. フロントエンド → `/api/auth/login` にメール/パスワード送信
2. バックエンド → Supabase認証 → JWTトークン生成
3. フロントエンド → LocalStorageにトークン保存
4. 以降のAPIリクエストにAuthorizationヘッダー付与

## セキュリティ対策

1. **CORS設定**: 特定のオリジンのみ許可
2. **レート制限**: express-rate-limit使用
3. **入力検証**: express-validatorで全入力を検証
4. **SQLインジェクション対策**: Supabaseクライアント使用
5. **XSS対策**: フロントエンドでのエスケープ処理
6. **HTTPS必須**: 本番環境ではHTTPS強制

## 開発の流れ

1. **Phase 1**: バックエンドAPI構築
   - 認証システム
   - 代理店CRUD API
   - 売上管理API

2. **Phase 2**: フロントエンド構築
   - ログイン画面
   - ダッシュボード
   - 代理店管理画面

3. **Phase 3**: 連携テスト
   - API通信確認
   - エラーハンドリング
   - パフォーマンス最適化