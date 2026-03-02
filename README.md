# AgentTree - 多段階営業代理店管理システム

4層までの代理店階層をサポートする営業代理店管理システム。
売上追跡・報酬計算・請求書/領収書発行・異常検知を一元管理。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | Vanilla JavaScript SPA |
| Backend | Node.js 18+ / Express 4.18 |
| Database | Supabase (PostgreSQL + Storage) |
| Auth | JWT + 2FA (TOTP) |
| Deploy | Render (auto-deploy from main) |

## セットアップ

```bash
# 1. 依存関係インストール
cd backend && npm install
cd ../frontend && npm install

# 2. 環境変数
cp .env.example .env
# .env を編集: SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET, JWT_REFRESH_SECRET

# 3. データベース
# Supabase SQL Editor で database/full-setup.sql を実行

# 4. 管理者アカウント作成
cd backend
node src/scripts/create-admin.js <email> <password>

# 5. 起動
npm run dev          # Backend: http://localhost:3001
cd ../frontend
npx http-server -p 3000  # Frontend: http://localhost:3000
```

## テスト

```bash
cd backend && npm test       # 444 tests
cd ../frontend && npm test   # 42 tests
```

## ドキュメント

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - システム全体設計・API一覧・DB設計・セキュリティ
- **[TODO_REQUIREMENTS.md](./TODO_REQUIREMENTS.md)** - 実装進捗

## ライセンス

MIT
