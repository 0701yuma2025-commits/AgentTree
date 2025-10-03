/**
 * 書類管理API
 */

const API_URL = 'http://localhost:3001/api';

const documentsAPI = {
  /**
   * 書類一覧取得
   */
  async getDocuments(agencyId) {
    try {
      const response = await apiClient.get(`/documents/${agencyId}`);
      return response;
    } catch (error) {
      console.error('Get documents error:', error);
      throw error;
    }
  },

  /**
   * 書類アップロード
   */
  async uploadDocument(file, agencyId, documentType) {
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('agency_id', agencyId);
      formData.append('document_type', documentType);

      const response = await fetch(`${API_URL}/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('agency_system_token') || localStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'アップロードに失敗しました');
      }

      return data;
    } catch (error) {
      console.error('Upload document error:', error);
      throw error;
    }
  },

  /**
   * 書類確認（管理者のみ）
   */
  async verifyDocument(documentId, status, rejectionReason = null) {
    try {
      const body = { status };
      if (rejectionReason) {
        body.rejection_reason = rejectionReason;
      }

      const response = await apiClient.put(`/documents/${documentId}/verify`, body);
      return response;
    } catch (error) {
      console.error('Verify document error:', error);
      throw error;
    }
  },

  /**
   * 書類削除
   */
  async deleteDocument(documentId) {
    try {
      const response = await apiClient.delete(`/documents/${documentId}`);
      return response;
    } catch (error) {
      console.error('Delete document error:', error);
      throw error;
    }
  }
};

// グローバルスコープに登録
window.documentsAPI = documentsAPI;