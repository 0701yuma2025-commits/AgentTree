/**
 * 代理店ヘルパー関数
 */

const { supabase } = require('../config/supabase');

/**
 * 指定された親代理店IDから、全ての下位代理店IDを再帰的に取得
 * @param {string} parentId - 親代理店ID
 * @returns {Promise<string[]>} 親代理店ID + 全下位代理店IDの配列
 */
async function getSubordinateAgencyIds(parentId) {
  const { data: children } = await supabase
    .from('agencies')
    .select('id')
    .eq('parent_agency_id', parentId);

  let ids = [parentId];
  if (children && children.length > 0) {
    for (const child of children) {
      const childIds = await getSubordinateAgencyIds(child.id);
      ids = ids.concat(childIds);
    }
  }
  return ids;
}

module.exports = { getSubordinateAgencyIds };
