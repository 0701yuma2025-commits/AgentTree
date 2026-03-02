/**
 * ページネーション ユーティリティ
 */

/**
 * クエリパラメータからページネーション情報を解析
 * @param {object} query - req.query
 * @param {number} defaultLimit - デフォルトのページサイズ (default: 50)
 * @param {number} maxLimit - 最大ページサイズ (default: 100)
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query, defaultLimit = 50, maxLimit = 100) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * ページネーション付きレスポンスを構築
 * @param {Array} data - データ配列
 * @param {number} total - 総件数
 * @param {{ page: number, limit: number }} pagination - ページネーション情報
 * @returns {object}
 */
function paginatedResponse(data, total, { page, limit }) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

module.exports = { parsePagination, paginatedResponse };
