# 書類宛先カスタマイズ機能

## 概要

請求書・領収書などの書類生成時に、宛先情報を自由にカスタマイズできる機能です。

### 主な機能

1. **宛先の手入力**: 書類生成時に宛先情報を自由に入力
2. **テンプレート保存**: よく使う宛先をテンプレートとして保存
3. **テンプレート選択**: 過去に保存したテンプレートから選択可能
4. **使用履歴管理**: 使用回数・最終使用日を自動記録

## データベース設定

### 1. マイグレーションの実行

```bash
# Supabaseコンソールで以下のSQLを実行
psql -U postgres -d your_database < database/add-document-templates.sql
```

または、Supabase管理画面のSQL Editorで`database/add-document-templates.sql`の内容を実行してください。

### 2. テーブル構成

```sql
document_recipients (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  template_name VARCHAR(255),      -- テンプレート名
  recipient_type VARCHAR(50),      -- 'admin', 'agency', 'custom'
  company_name VARCHAR(255),       -- 会社名
  postal_code VARCHAR(20),         -- 郵便番号
  address TEXT,                    -- 住所
  contact_person VARCHAR(255),     -- 担当者名
  department VARCHAR(255),         -- 部署名
  phone VARCHAR(20),               -- 電話番号
  email VARCHAR(255),              -- メールアドレス
  notes TEXT,                      -- 備考
  is_favorite BOOLEAN,             -- お気に入りフラグ
  use_count INTEGER,               -- 使用回数
  last_used_at TIMESTAMP,          -- 最終使用日時
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## バックエンド実装

### 1. 新規APIエンドポイント

- `GET /api/document-recipients` - テンプレート一覧取得
- `GET /api/document-recipients/:id` - テンプレート詳細取得
- `POST /api/document-recipients` - テンプレート作成
- `PUT /api/document-recipients/:id` - テンプレート更新
- `DELETE /api/document-recipients/:id` - テンプレート削除
- `POST /api/document-recipients/:id/use` - 使用回数記録

### 2. 既存エンドポイントの拡張

#### `/api/invoices/generate` (POST)

リクエストボディに`recipient`オブジェクトを追加:

```json
{
  "commission_id": "uuid",
  "month": "2025-10",
  "recipient": {
    "company_name": "株式会社サンプル",
    "postal_code": "100-0001",
    "address": "東京都千代田区千代田1-1",
    "department": "経理部",
    "contact_person": "山田太郎",
    "phone": "03-1234-5678",
    "email": "yamada@example.com",
    "template_id": "uuid"  // オプション: 使用したテンプレートID
  }
}
```

## フロントエンド実装

### 1. 新規ファイル

- `frontend/js/api/document-recipients.js` - API クライアント

### 2. 変更ファイル

- `frontend/js/pages/invoices.js` - 宛先選択モーダル追加
- `frontend/index.html` - スクリプト読み込み追加
- `frontend/css/modal.css` - モーダルスタイル追加

### 3. 使用方法

```javascript
// テンプレート一覧取得
const templates = await documentRecipientsAPI.getAll();

// テンプレート作成
const newTemplate = await documentRecipientsAPI.create({
  template_name: "本社宛",
  recipient_type: "custom",
  company_name: "株式会社サンプル",
  address: "東京都千代田区千代田1-1"
});

// 使用回数記録
await documentRecipientsAPI.recordUse(templateId);
```

## UI/UX

### 書類生成フロー

1. ユーザーが「請求書」ボタンをクリック
2. **宛先選択モーダルが表示**
   - 保存済みテンプレートのドロップダウン
   - 宛先情報入力フォーム（会社名、住所、担当者など）
   - 「このテンプレートを保存する」チェックボックス
3. 宛先情報を入力またはテンプレート選択
4. 「この宛先で生成」ボタンをクリック
5. PDFが生成・ダウンロード

### モーダルUI

```
┌─────────────────────────────────────────┐
│ 書類の宛先を選択                           │
├─────────────────────────────────────────┤
│ 保存済みテンプレートから選択:               │
│ [▼ -- 新規入力 --                    ] │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 会社名* [                          ] │ │
│ │ 郵便番号 [                         ] │ │
│ │ 住所    [                          ] │ │
│ │ 部署    [          ] 担当者 [      ] │ │
│ │ 電話番号 [         ] Email [       ] │ │
│ │                                     │ │
│ │ □ このテンプレートを保存する           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│                [キャンセル] [この宛先で生成] │
└─────────────────────────────────────────┘
```

## セキュリティ

- ユーザーは自分のテンプレートのみアクセス可能
- システム共通テンプレート（`user_id IS NULL`）は全員が閲覧可能
- 管理者は全テンプレートにアクセス可能
- JWT認証必須

## テスト項目

### 手動テスト

1. **テンプレート作成**
   - [ ] 新規テンプレートを作成できる
   - [ ] 必須項目（会社名）のバリデーション
   - [ ] テンプレート名の重複確認

2. **テンプレート選択**
   - [ ] ドロップダウンから選択してフォームに自動入力
   - [ ] お気に入りマーク（★）の表示

3. **PDF生成**
   - [ ] カスタム宛先情報がPDFに反映される
   - [ ] 長い住所が正しく改行される
   - [ ] 郵便番号のフォーマット（〒100-0001）

4. **使用履歴**
   - [ ] 使用回数が正しくインクリメント
   - [ ] 最終使用日時が更新される
   - [ ] 人気順（使用回数順）でソート

5. **権限管理**
   - [ ] 他ユーザーのテンプレートにアクセスできない
   - [ ] システム共通テンプレートは全員が閲覧可能

### 自動テスト（推奨）

```javascript
// APIテスト例
describe('Document Recipients API', () => {
  it('should create a new template', async () => {
    const response = await request(app)
      .post('/api/document-recipients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        template_name: 'Test Template',
        recipient_type: 'custom',
        company_name: 'Test Company'
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

## トラブルシューティング

### Q: モーダルが表示されない

**A:** ブラウザのコンソールでエラーを確認してください。

```javascript
// デバッグ用
console.log('documentRecipientsAPI:', window.documentRecipientsAPI);
```

### Q: テンプレートが保存されない

**A:** 以下を確認してください：

1. データベースマイグレーションが実行されているか
2. JWT トークンが有効か
3. ネットワークタブでAPIエラーを確認

### Q: PDFに宛先が反映されない

**A:** バックエンドの`invoices.js`で`recipient`パラメータが正しく渡されているか確認:

```javascript
console.log('Recipient data:', req.body.recipient);
```

## 今後の拡張案

1. **テンプレートのカテゴリ分け**: 「本社」「支店」「取引先」などのカテゴリ
2. **お気に入り機能の強化**: スター評価、カラータグ
3. **テンプレート共有**: チーム内でテンプレートを共有
4. **CSVインポート**: 大量の宛先をCSVで一括登録
5. **印刷プレビュー**: PDF生成前にプレビュー表示

## 関連ファイル

### バックエンド
- `backend/src/routes/document-recipients.js`
- `backend/src/routes/invoices.js`
- `backend/src/utils/pdf-generator.js`
- `backend/server.js`
- `database/add-document-templates.sql`

### フロントエンド
- `frontend/js/api/document-recipients.js`
- `frontend/js/pages/invoices.js`
- `frontend/css/modal.css`
- `frontend/index.html`

## サポート

問題が発生した場合は、GitHubのIssuesセクションに報告してください。
