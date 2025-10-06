/**
 * 売上管理API
 */

class SalesAPI {
  /**
   * 売上一覧取得
   */
  async getSales(filters = {}) {
    try {
      const response = await apiClient.get('/sales', filters);
      return response;
    } catch (error) {
      errorLog('Get sales error:', error);
      throw error;
    }
  }

  /**
   * 売上詳細取得
   */
  async getSale(id) {
    try {
      const response = await apiClient.get(`/sales/${id}`);
      return response;
    } catch (error) {
      errorLog('Get sale error:', error);
      throw error;
    }
  }

  /**
   * 売上作成
   */
  async createSale(data) {
    try {
      const response = await apiClient.post('/sales', data);
      return response;
    } catch (error) {
      errorLog('Create sale error:', error);
      throw error;
    }
  }

  /**
   * 売上更新
   */
  async updateSale(id, data) {
    try {
      const response = await apiClient.put(`/sales/${id}`, data);
      return response;
    } catch (error) {
      errorLog('Update sale error:', error);
      throw error;
    }
  }

  /**
   * 売上削除
   */
  async deleteSale(id) {
    try {
      const response = await apiClient.delete(`/sales/${id}`);
      return response;
    } catch (error) {
      errorLog('Delete sale error:', error);
      throw error;
    }
  }

  /**
   * 売上CSVエクスポート
   */
  async exportCSV(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (filters.start_date) queryParams.append('start_date', filters.start_date);
      if (filters.end_date) queryParams.append('end_date', filters.end_date);
      if (filters.agency_id) queryParams.append('agency_id', filters.agency_id);

      const response = await fetch(`${CONFIG.API_BASE_URL}/sales/export?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN)}`
        }
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      errorLog('Export sales CSV error:', error);
      throw error;
    }
  }
}

// グローバルスコープに登録
window.salesAPI = new SalesAPI();