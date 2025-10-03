/**
 * 報酬管理API
 */

const commissionsAPI = {
  /**
   * 報酬一覧取得
   */
  async getCommissions(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.month) queryParams.append('month', params.month);
      if (params.status) queryParams.append('status', params.status);
      if (params.agency_id) queryParams.append('agency_id', params.agency_id);

      const response = await apiClient.get(`/commissions?${queryParams}`);
      return response;
    } catch (error) {
      console.error('Get commissions error:', error);
      throw error;
    }
  },

  /**
   * 報酬サマリー取得
   */
  async getSummary(month = null) {
    try {
      const params = {};
      if (month) params.month = month;

      const response = await apiClient.get('/commissions/summary', params);
      return response;
    } catch (error) {
      console.error('Get commission summary error:', error);
      throw error;
    }
  },

  /**
   * 報酬計算実行
   */
  async calculateCommissions(month = null) {
    try {
      const data = {};
      if (month) {
        data.month = month;
      }

      const response = await apiClient.post('/commissions/calculate', data);
      return response;
    } catch (error) {
      console.error('Calculate commissions error:', error);
      throw error;
    }
  },

  /**
   * 報酬確定
   */
  async confirmCommission(id) {
    try {
      const response = await apiClient.put(`/commissions/${id}/confirm`);
      return response;
    } catch (error) {
      console.error('Confirm commission error:', error);
      throw error;
    }
  },

  /**
   * 報酬CSVエクスポート
   */
  async exportCSV(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (filters.month) queryParams.append('month', filters.month);
      if (filters.agency_id) queryParams.append('agency_id', filters.agency_id);
      if (filters.status) queryParams.append('status', filters.status);

      const response = await fetch(`${CONFIG.API_BASE_URL}/commissions/export?${queryParams}`, {
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
      a.download = `commissions_${filters.month || new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      console.error('Export commissions CSV error:', error);
      throw error;
    }
  }
};

// グローバルスコープに登録
window.commissionsAPI = commissionsAPI;