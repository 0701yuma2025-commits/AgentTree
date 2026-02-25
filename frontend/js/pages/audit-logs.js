/**
 * 監査ログページ
 */

class AuditLogsPage {
  constructor() {
    this.currentPage = 1;
    this.limit = 50;
    this.totalPages = 1;
    this.filters = {};
    this.logs = [];
  }

  /**
   * ページ初期化
   */
  async init() {
    // イベントリスナー設定
    this.setupEventListeners();

    // 監査ログ読み込み
    await this.loadAuditLogs();
  }

  /**
   * イベントリスナー設定
   */
  setupEventListeners() {
    // フィルター適用ボタン
    document.getElementById('applyAuditLogFilter')?.addEventListener('click', () => {
      this.applyFilters();
    });

    // フィルターリセットボタン
    document.getElementById('resetAuditLogFilter')?.addEventListener('click', () => {
      this.resetFilters();
    });

    // CSVエクスポートボタン
    document.getElementById('exportAuditLogsCsv')?.addEventListener('click', () => {
      this.exportCsv();
    });

    // ページネーション
    document.getElementById('prevAuditLogsPage')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadAuditLogs();
      }
    });

    document.getElementById('nextAuditLogsPage')?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.loadAuditLogs();
      }
    });

    // Enterキーで検索
    document.getElementById('searchAuditLogs')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.applyFilters();
      }
    });
  }

  /**
   * 監査ログ読み込み
   */
  async loadAuditLogs() {
    try {
      const params = {
        page: this.currentPage,
        limit: this.limit,
        ...this.filters
      };

      const response = await AuditLogsAPI.getAuditLogs(params);

      if (response.success) {
        this.logs = response.data.logs;
        const pagination = response.data.pagination;

        this.totalPages = pagination.totalPages;
        this.renderTable();
        this.updatePagination(pagination);
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      alert('監査ログの読み込みに失敗しました');
    }
  }

  /**
   * テーブル描画
   */
  renderTable() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    if (this.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">監査ログがありません</td></tr>';
      return;
    }

    tbody.innerHTML = this.logs.map(log => `
      <tr>
        <td>${this.formatTimestamp(log.timestamp)}</td>
        <td>
          <div>${this.escapeHtml(log.user_email || '-')}</div>
          <small class="text-muted">${this.getRoleName(log.user_role)}</small>
        </td>
        <td>
          <span class="badge ${this.getActionBadgeClass(log.action)}">
            ${this.getActionName(log.action)}
          </span>
        </td>
        <td>
          <div>${this.getResourceTypeName(log.resource_type)}</div>
          ${log.resource_id ? `<small class="text-muted">${log.resource_id.substring(0, 8)}...</small>` : ''}
        </td>
        <td>${this.escapeHtml(log.description || '-')}</td>
        <td>
          <span class="badge ${this.getStatusBadgeClass(log.status)}">
            ${this.getStatusName(log.status)}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="auditLogsPage.showLogDetail('${log.id}')">
            詳細
          </button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * ページネーション更新
   */
  updatePagination(pagination) {
    const pageInfo = document.getElementById('auditLogsPageInfo');
    if (pageInfo) {
      pageInfo.textContent = `${pagination.page} / ${pagination.totalPages}`;
    }

    const prevBtn = document.getElementById('prevAuditLogsPage');
    const nextBtn = document.getElementById('nextAuditLogsPage');

    if (prevBtn) {
      prevBtn.disabled = pagination.page <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = pagination.page >= pagination.totalPages;
    }
  }

  /**
   * フィルター適用
   */
  applyFilters() {
    this.filters = {};

    const startDate = document.getElementById('filterStartDate')?.value;
    const endDate = document.getElementById('filterEndDate')?.value;
    const action = document.getElementById('filterAction')?.value;
    const resourceType = document.getElementById('filterResourceType')?.value;
    const status = document.getElementById('filterStatus')?.value;
    const search = document.getElementById('searchAuditLogs')?.value;

    if (startDate) this.filters.start_date = startDate + 'T00:00:00Z';
    if (endDate) this.filters.end_date = endDate + 'T23:59:59Z';
    if (action) this.filters.action = action;
    if (resourceType) this.filters.resource_type = resourceType;
    if (status) this.filters.status = status;
    if (search) this.filters.search = search;

    this.currentPage = 1;
    this.loadAuditLogs();
  }

  /**
   * フィルターリセット
   */
  resetFilters() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterAction').value = '';
    document.getElementById('filterResourceType').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('searchAuditLogs').value = '';

    this.filters = {};
    this.currentPage = 1;
    this.loadAuditLogs();
  }

  /**
   * CSVエクスポート
   */
  async exportCsv() {
    try {
      await AuditLogsAPI.exportCsv(this.filters);
      alert('CSVエクスポートが完了しました');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('CSVエクスポートに失敗しました');
    }
  }

  /**
   * ログ詳細表示
   */
  async showLogDetail(logId) {
    try {
      const response = await AuditLogsAPI.getAuditLog(logId);

      if (response.success) {
        const log = response.data;
        this.renderLogDetailModal(log);
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('Failed to load log detail:', error);
      alert('ログ詳細の読み込みに失敗しました');
    }
  }

  /**
   * ログ詳細モーダル描画
   */
  renderLogDetailModal(log) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;

    let changesHtml = '';
    if (log.changes) {
      changesHtml = `
        <div class="log-detail-section">
          <h4>変更内容</h4>
          <pre>${JSON.stringify(log.changes, null, 2)}</pre>
        </div>
      `;
    }

    let metadataHtml = '';
    if (log.metadata) {
      metadataHtml = `
        <div class="log-detail-section">
          <h4>メタデータ</h4>
          <pre>${JSON.stringify(log.metadata, null, 2)}</pre>
        </div>
      `;
    }

    let errorHtml = '';
    if (log.error_message) {
      errorHtml = `
        <div class="log-detail-section error">
          <h4>エラーメッセージ</h4>
          <p>${this.escapeHtml(log.error_message)}</p>
        </div>
      `;
    }

    modalBody.innerHTML = `
      <h3>監査ログ詳細</h3>
      <div class="log-detail">
        <div class="log-detail-section">
          <h4>基本情報</h4>
          <table class="detail-table">
            <tr>
              <th>ID</th>
              <td>${log.id}</td>
            </tr>
            <tr>
              <th>タイムスタンプ</th>
              <td>${this.formatTimestamp(log.timestamp)}</td>
            </tr>
            <tr>
              <th>ユーザー</th>
              <td>${this.escapeHtml(log.user_email || '-')} (${this.getRoleName(log.user_role)})</td>
            </tr>
            <tr>
              <th>IPアドレス</th>
              <td>${this.escapeHtml(log.ip_address || '-')}</td>
            </tr>
            <tr>
              <th>User Agent</th>
              <td>${this.escapeHtml(log.user_agent || '-')}</td>
            </tr>
          </table>
        </div>

        <div class="log-detail-section">
          <h4>操作情報</h4>
          <table class="detail-table">
            <tr>
              <th>アクション</th>
              <td><span class="badge ${this.getActionBadgeClass(log.action)}">${this.getActionName(log.action)}</span></td>
            </tr>
            <tr>
              <th>リソース種別</th>
              <td>${this.getResourceTypeName(log.resource_type)}</td>
            </tr>
            <tr>
              <th>リソースID</th>
              <td>${log.resource_id || '-'}</td>
            </tr>
            <tr>
              <th>説明</th>
              <td>${this.escapeHtml(log.description || '-')}</td>
            </tr>
            <tr>
              <th>ステータス</th>
              <td><span class="badge ${this.getStatusBadgeClass(log.status)}">${this.getStatusName(log.status)}</span></td>
            </tr>
          </table>
        </div>

        ${changesHtml}
        ${metadataHtml}
        ${errorHtml}
      </div>
    `;

    // モーダル表示
    app.showModal();
  }

  /**
   * ユーティリティ: タイムスタンプフォーマット
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * ユーティリティ: HTMLエスケープ
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * アクション名取得
   */
  getActionName(action) {
    const names = {
      'create': '作成',
      'read': '閲覧',
      'update': '更新',
      'delete': '削除',
      'login': 'ログイン',
      'logout': 'ログアウト',
      'export': 'エクスポート'
    };
    return names[action] || action;
  }

  /**
   * アクションバッジクラス取得
   */
  getActionBadgeClass(action) {
    const classes = {
      'create': 'badge-success',
      'read': 'badge-info',
      'update': 'badge-warning',
      'delete': 'badge-danger',
      'login': 'badge-primary',
      'logout': 'badge-secondary',
      'export': 'badge-info'
    };
    return classes[action] || 'badge-secondary';
  }

  /**
   * リソース種別名取得
   */
  getResourceTypeName(resourceType) {
    const names = {
      'agency': '代理店',
      'sale': '売上',
      'commission': '報酬',
      'user': 'ユーザー',
      'product': '商品',
      'campaign': 'キャンペーン',
      'authentication': '認証',
      'system_setting': 'システム設定'
    };
    return names[resourceType] || resourceType;
  }

  /**
   * ステータス名取得
   */
  getStatusName(status) {
    const names = {
      'success': '成功',
      'failure': '失敗',
      'error': 'エラー'
    };
    return names[status] || status;
  }

  /**
   * ステータスバッジクラス取得
   */
  getStatusBadgeClass(status) {
    const classes = {
      'success': 'badge-success',
      'failure': 'badge-danger',
      'error': 'badge-danger'
    };
    return classes[status] || 'badge-secondary';
  }

  /**
   * ロール名取得
   */
  getRoleName(role) {
    const names = {
      'super_admin': 'スーパー管理者',
      'admin': '管理者',
      'agency': '代理店',
      'user': '一般ユーザー'
    };
    return names[role] || role;
  }
}

// グローバルインスタンス
const auditLogsPage = new AuditLogsPage();
