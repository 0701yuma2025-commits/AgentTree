/**
 * 報酬設定API
 */

const commissionSettingsAPI = {
  /**
   * 現在有効な報酬設定を取得
   */
  async getCurrent() {
    return apiClient.get('/commission-settings/current');
  },

  /**
   * 報酬設定履歴を取得
   */
  async getHistory() {
    return apiClient.get('/commission-settings/history');
  },

  /**
   * 報酬設定を更新
   */
  async update(data) {
    return apiClient.post('/commission-settings', data);
  },

  /**
   * 次回支払い予定日を取得
   */
  async getNextPaymentDate() {
    return apiClient.get('/commission-settings/next-payment-date');
  }
};

// グローバルスコープに登録
window.commissionSettingsAPI = commissionSettingsAPI;