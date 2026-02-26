/**
 * 書類管理コンポーネント
 */

class DocumentsManager {
  constructor(agencyId) {
    this.agencyId = agencyId;
    this.documents = [];
  }

  /**
   * 書類管理セクションのHTML生成
   */
  getDocumentsSectionHTML(isAdmin = false, companyType = 'corporation') {
    const documentTypes = this.getDocumentTypes(companyType);

    return `
      <div class="documents-section">
        <h3>提出書類</h3>

        <div class="document-upload">
          <h4>書類アップロード（任意）</h4>
          <div class="upload-form">
            <select id="documentType" class="form-control">
              ${documentTypes.map(type =>
                `<option value="${type.value}">${type.label}</option>`
              ).join('')}
            </select>
            <input type="file" id="documentFile" accept=".pdf,.jpg,.jpeg,.png,.gif" class="form-control">
            <button onclick="documentsManager.uploadDocument()" class="btn btn-primary">アップロード</button>
          </div>
          <p class="text-muted">※ PDF、JPG、PNG、GIF形式（最大10MB）</p>
        </div>

        <div class="documents-list">
          <h4>アップロード済み書類</h4>
          <div id="documentsList"></div>
        </div>
      </div>
    `;
  }

  /**
   * 書類タイプの取得
   */
  getDocumentTypes(companyType) {
    const commonTypes = [
      { value: 'bank_statement', label: '口座確認書' },
      { value: 'other', label: 'その他' }
    ];

    if (companyType === 'corporation') {
      return [
        { value: 'registration_certificate', label: '登記簿謄本' },
        { value: 'seal_certificate', label: '印鑑証明書（法人）' },
        ...commonTypes
      ];
    } else {
      return [
        { value: 'id_card', label: '身分証明書' },
        { value: 'seal_certificate', label: '印鑑証明書（個人）' },
        ...commonTypes
      ];
    }
  }

  /**
   * 書類一覧の読み込みと表示
   */
  async loadDocuments() {
    try {
      const response = await window.documentsAPI.getDocuments(this.agencyId);
      if (response.success) {
        this.documents = response.data;
        this.displayDocuments();
      }
    } catch (error) {
      console.error('Load documents error:', error);
    }
  }

  /**
   * 書類一覧の表示
   */
  displayDocuments() {
    const listContainer = document.getElementById('documentsList');
    if (!listContainer) return;

    if (this.documents.length === 0) {
      listContainer.innerHTML = '<p class="text-muted">アップロード済みの書類はありません</p>';
      return;
    }

    const user = JSON.parse(localStorage.getItem('agency_system_user') || '{}');
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    listContainer.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>書類種別</th>
            <th>ファイル名</th>
            <th>ステータス</th>
            <th>アップロード日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${this.documents.map(doc => this.getDocumentRow(doc, isAdmin)).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * 書類行の生成
   */
  getDocumentRow(doc, isAdmin) {
    const statusMap = {
      'pending': '<span class="status status-pending">未確認</span>',
      'verified': '<span class="status status-active">確認済</span>',
      'rejected': '<span class="status status-error">却下</span>'
    };

    const typeMap = {
      'registration_certificate': '登記簿謄本',
      'seal_certificate': '印鑑証明',
      'bank_statement': '口座確認書',
      'id_card': '身分証明書',
      'other': 'その他'
    };

    return `
      <tr>
        <td>${typeMap[doc.document_type] || doc.document_type}</td>
        <td>
          <a href="${doc.file_url}" target="_blank" class="link">${doc.document_name}</a>
        </td>
        <td>${statusMap[doc.status] || doc.status}</td>
        <td>${new Date(doc.created_at).toLocaleDateString()}</td>
        <td>
          ${isAdmin && doc.status === 'pending' ? `
            <button onclick="documentsManager.verifyDocument('${doc.id}', 'verified')"
                    class="btn btn-small btn-success">承認</button>
            <button onclick="documentsManager.rejectDocument('${doc.id}')"
                    class="btn btn-small btn-warning">却下</button>
          ` : ''}
          ${doc.status === 'rejected' && doc.rejection_reason ?
            `<span class="text-error" title="${doc.rejection_reason}">却下理由あり</span>` : ''}
          <button onclick="documentsManager.deleteDocument('${doc.id}')"
                  class="btn btn-small btn-danger">削除</button>
        </td>
      </tr>
    `;
  }

  /**
   * 書類アップロード
   */
  async uploadDocument() {
    const fileInput = document.getElementById('documentFile');
    const typeSelect = document.getElementById('documentType');

    if (!fileInput.files[0]) {
      alert('ファイルを選択してください');
      return;
    }

    const file = fileInput.files[0];
    const documentType = typeSelect.value;

    // ファイルサイズチェック（10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert('ファイルサイズは10MB以下にしてください');
      return;
    }

    try {
      const response = await window.documentsAPI.uploadDocument(file, this.agencyId, documentType);
      if (response.success) {
        alert('書類をアップロードしました');
        fileInput.value = '';
        await this.loadDocuments();
      }
    } catch (error) {
      alert('アップロードに失敗しました');
    }
  }

  /**
   * 書類承認（管理者のみ）
   */
  async verifyDocument(documentId, status) {
    if (!confirm('この書類を承認しますか？')) return;

    try {
      const response = await window.documentsAPI.verifyDocument(documentId, status);
      if (response.success) {
        alert('書類を承認しました');
        await this.loadDocuments();
      }
    } catch (error) {
      alert('承認に失敗しました');
    }
  }

  /**
   * 書類却下（管理者のみ）
   */
  async rejectDocument(documentId) {
    const reason = prompt('却下理由を入力してください');
    if (!reason) return;

    try {
      const response = await window.documentsAPI.verifyDocument(documentId, 'rejected', reason);
      if (response.success) {
        alert('書類を却下しました');
        await this.loadDocuments();
      }
    } catch (error) {
      alert('却下に失敗しました');
    }
  }

  /**
   * 書類削除
   */
  async deleteDocument(documentId) {
    if (!confirm('この書類を削除しますか？')) return;

    try {
      const response = await window.documentsAPI.deleteDocument(documentId);
      if (response.success) {
        alert('書類を削除しました');
        await this.loadDocuments();
      }
    } catch (error) {
      alert('削除に失敗しました');
    }
  }
}

// グローバルスコープに登録
window.DocumentsManager = DocumentsManager;
window.documentsManager = null; // 使用時にインスタンス化