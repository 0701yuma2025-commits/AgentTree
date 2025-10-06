/**
 * キャンペーン管理APIクライアント
 */

const campaignsAPI = {
  /**
   * キャンペーン一覧取得
   */
  async getCampaigns(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (filters.active_only) queryParams.append('active_only', 'true');
      if (filters.include_expired) queryParams.append('include_expired', 'true');

      const response = await apiClient.get(`/campaigns?${queryParams}`);
      return response.data || [];
    } catch (error) {
      errorLog('Get campaigns error:', error);
      throw error;
    }
  },

  /**
   * 現在有効なキャンペーン取得
   */
  async getActiveCampaigns(date = null) {
    try {
      const queryParams = date ? `?date=${date}` : '';
      const response = await apiClient.get(`/campaigns/active${queryParams}`);
      return response.data || [];
    } catch (error) {
      errorLog('Get active campaigns error:', error);
      throw error;
    }
  },

  /**
   * キャンペーン詳細取得
   */
  async getCampaignDetail(id) {
    try {
      const response = await apiClient.get(`/campaigns/${id}`);
      return response;
    } catch (error) {
      errorLog('Get campaign detail error:', error);
      throw error;
    }
  },

  /**
   * キャンペーン作成
   */
  async createCampaign(campaignData) {
    try {
      const response = await apiClient.post('/campaigns', campaignData);
      return response;
    } catch (error) {
      errorLog('Create campaign error:', error);
      throw error;
    }
  },

  /**
   * キャンペーン更新
   */
  async updateCampaign(id, updates) {
    try {
      const response = await apiClient.put(`/campaigns/${id}`, updates);
      return response;
    } catch (error) {
      errorLog('Update campaign error:', error);
      throw error;
    }
  },

  /**
   * キャンペーン削除
   */
  async deleteCampaign(id) {
    try {
      const response = await apiClient.delete(`/campaigns/${id}`);
      return response;
    } catch (error) {
      errorLog('Delete campaign error:', error);
      throw error;
    }
  }
};

// グローバルに公開
window.campaignsAPI = campaignsAPI;