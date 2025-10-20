/**
 * 監査ログAPI
 */

const AuditLogsAPI = {
  /**
   * 監査ログ一覧取得
   */
  async getAuditLogs(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.action) queryParams.append('action', params.action);
    if (params.resource_type) queryParams.append('resource_type', params.resource_type);
    if (params.status) queryParams.append('status', params.status);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    if (params.search) queryParams.append('search', params.search);

    const url = `/audit-logs?${queryParams.toString()}`;
    return await apiClient.get(url);
  },

  /**
   * 監査ログ詳細取得
   */
  async getAuditLog(id) {
    return await apiClient.get(`/audit-logs/${id}`);
  },

  /**
   * 監査ログ統計取得
   */
  async getStats(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);

    const url = `/audit-logs/stats/summary?${queryParams.toString()}`;
    return await apiClient.get(url);
  },

  /**
   * CSVエクスポート
   */
  async exportCsv(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.action) queryParams.append('action', params.action);
    if (params.resource_type) queryParams.append('resource_type', params.resource_type);
    if (params.status) queryParams.append('status', params.status);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);

    const url = `${CONFIG.API_BASE_URL}/audit-logs/export/csv?${queryParams.toString()}`;

    // 認証トークン取得
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    if (!token) {
      throw new Error('認証されていません');
    }

    // ダウンロード用のリンクを生成
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;

    // Authorization ヘッダーを含むリクエストを fetch で実行
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('エクスポートに失敗しました');
    }

    // Blob を作成してダウンロード
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  }
};
