/**
 * 商品管理API
 */

window.productsAPI = {
  /**
   * 商品一覧取得
   */
  async getProducts() {
    return await apiClient.get('/products');
  },

  /**
   * 商品詳細取得
   */
  async getProduct(id) {
    return await apiClient.get(`/products/${id}`);
  },

  /**
   * 商品作成
   */
  async createProduct(productData) {
    return await apiClient.post('/products', productData);
  },

  /**
   * 商品更新
   */
  async updateProduct(id, productData) {
    return await apiClient.put(`/products/${id}`, productData);
  },

  /**
   * 商品削除（ソフトデリート）
   */
  async deleteProduct(id) {
    return await apiClient.delete(`/products/${id}`);
  }
};