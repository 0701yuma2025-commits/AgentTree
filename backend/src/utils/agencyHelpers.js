/**
 * 代理店ヘルパー関数
 */

const { supabase } = require('../config/supabase');

const MAX_RECURSION_DEPTH = 10;

/**
 * 指定された親代理店IDから、全ての下位代理店IDを再帰的に取得
 * @param {string} parentId - 親代理店ID
 * @param {number} depth - 現在の再帰の深さ（内部使用）
 * @returns {Promise<string[]>} 親代理店ID + 全下位代理店IDの配列
 */
async function getSubordinateAgencyIds(parentId, depth = 0) {
  if (depth >= MAX_RECURSION_DEPTH) {
    console.warn(`getSubordinateAgencyIds: 最大再帰深度(${MAX_RECURSION_DEPTH})に到達しました。parentId=${parentId}`);
    return [parentId];
  }

  const { data: children } = await supabase
    .from('agencies')
    .select('id')
    .eq('parent_agency_id', parentId);

  let ids = [parentId];
  if (children && children.length > 0) {
    for (const child of children) {
      if (ids.includes(child.id)) continue; // 循環参照を防止
      const childIds = await getSubordinateAgencyIds(child.id, depth + 1);
      ids = ids.concat(childIds);
    }
  }
  return ids;
}

module.exports = { getSubordinateAgencyIds };
