/**
 * 書類宛先テンプレートAPI
 */

const documentRecipientsAPI = {
  /**
   * テンプレート一覧取得
   */
  async getAll(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.favorite_only) params.append('favorite_only', 'true');

    const queryString = params.toString();
    const endpoint = queryString ? `/document-recipients?${queryString}` : '/document-recipients';

    return await apiClient.get(endpoint);
  },

  /**
   * テンプレート詳細取得
   */
  async getById(id) {
    return await apiClient.get(`/document-recipients/${id}`);
  },

  /**
   * テンプレート作成
   */
  async create(data) {
    return await apiClient.post('/document-recipients', data);
  },

  /**
   * テンプレート更新
   */
  async update(id, data) {
    return await apiClient.put(`/document-recipients/${id}`, data);
  },

  /**
   * テンプレート削除
   */
  async delete(id) {
    return await apiClient.delete(`/document-recipients/${id}`);
  },

  /**
   * 使用回数を記録
   */
  async recordUse(id) {
    return await apiClient.post(`/document-recipients/${id}/use`);
  }
};

// グローバルに公開
window.documentRecipientsAPI = documentRecipientsAPI;
