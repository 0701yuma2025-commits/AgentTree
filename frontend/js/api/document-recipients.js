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

    const result = await apiClient.get(endpoint);
    return result?.data || result || [];
  },

  /**
   * テンプレート詳細取得
   */
  async getById(id) {
    const result = await apiClient.get(`/document-recipients/${id}`);
    return result?.data || result;
  },

  /**
   * テンプレート作成
   */
  async create(data) {
    const result = await apiClient.post('/document-recipients', data);
    return result?.data || result;
  },

  /**
   * テンプレート更新
   */
  async update(id, data) {
    const result = await apiClient.put(`/document-recipients/${id}`, data);
    return result?.data || result;
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
