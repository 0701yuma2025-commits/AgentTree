/**
 * 代理店管理API
 */

class AgenciesAPI {
  /**
   * 代理店一覧取得
   */
  async getAgencies(filters = {}) {
    try {
      const response = await apiClient.get('/agencies', filters);
      return response.data || [];
    } catch (error) {
      errorLog('Get agencies error:', error);
      throw error;
    }
  }

  /**
   * 代理店詳細取得
   */
  async getAgency(id) {
    try {
      const response = await apiClient.get(`/agencies/${id}`);
      return response.data;
    } catch (error) {
      errorLog('Get agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店作成
   */
  async createAgency(data) {
    try {
      const response = await apiClient.post('/agencies', data);
      return response.data;
    } catch (error) {
      errorLog('Create agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店更新
   */
  async updateAgency(id, data) {
    try {
      const response = await apiClient.put(`/agencies/${id}`, data);
      return response.data;
    } catch (error) {
      errorLog('Update agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店承認
   */
  async approveAgency(id) {
    try {
      const response = await apiClient.put(`/agencies/${id}/approve`);
      return response.data;
    } catch (error) {
      errorLog('Approve agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店拒否
   */
  async rejectAgency(id, rejectionReason) {
    try {
      const response = await apiClient.put(`/agencies/${id}/reject`, {
        rejection_reason: rejectionReason
      });
      return response.data;
    } catch (error) {
      errorLog('Reject agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店停止
   */
  async suspendAgency(id, suspensionReason) {
    try {
      const response = await apiClient.put(`/agencies/${id}/suspend`, {
        suspension_reason: suspensionReason
      });
      return response.data;
    } catch (error) {
      console.error('API Suspend agency error:', error);
      errorLog('Suspend agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店削除
   */
  async delete(id) {
    try {
      const response = await apiClient.delete(`/agencies/${id}`);
      return response.data;
    } catch (error) {
      errorLog('Delete agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店再有効化
   */
  async reactivateAgency(id) {
    try {
      const response = await apiClient.put(`/agencies/${id}/reactivate`);
      return response.data;
    } catch (error) {
      errorLog('Reactivate agency error:', error);
      throw error;
    }
  }

  /**
   * 代理店登録履歴取得
   */
  async getAgencyHistory(id) {
    try {
      const response = await apiClient.get(`/agencies/${id}/history`);
      return response.data || [];
    } catch (error) {
      errorLog('Get agency history error:', error);
      throw error;
    }
  }

  /**
   * 代理店CSVエクスポート
   */
  async exportCSV(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (filters.tier) queryParams.append('tier', filters.tier);
      if (filters.status) queryParams.append('status', filters.status);

      const response = await fetch(`${CONFIG.API_BASE_URL}/agencies/export?${queryParams}`, {
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
      a.download = `agencies_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      errorLog('Export agencies CSV error:', error);
      throw error;
    }
  }
}

const agenciesAPI = new AgenciesAPI();

// グローバルに公開
window.agenciesAPI = agenciesAPI;