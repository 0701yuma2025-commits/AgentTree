/**
 * 代理店ヘルパー関数
 */

const { supabase } = require('../config/supabase');

const MAX_RECURSION_DEPTH = 10;

/**
 * 全代理店の親子関係を1クエリで取得し、メモリ内でツリーを構築
 * @returns {Promise<Map<string|null, string[]>>} parentId → childIds のマップ
 */
async function buildParentChildMap() {
  const { data: allAgencies } = await supabase
    .from('agencies')
    .select('id, parent_agency_id');

  const map = new Map();
  for (const agency of (allAgencies || [])) {
    const parentId = agency.parent_agency_id || null;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(agency.id);
  }
  return map;
}

/**
 * メモリ内のマップからBFSで下位IDを収集（N+1なし）
 */
function collectDescendantIds(parentId, parentChildMap, maxDepth = MAX_RECURSION_DEPTH) {
  const ids = [parentId];
  const visited = new Set([parentId]);
  let queue = [parentId];
  let depth = 0;

  while (queue.length > 0 && depth < maxDepth) {
    const nextQueue = [];
    for (const id of queue) {
      const children = parentChildMap.get(id) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          ids.push(childId);
          nextQueue.push(childId);
        }
      }
    }
    queue = nextQueue;
    depth++;
  }

  return ids;
}

/**
 * 指定された親代理店IDから、全ての下位代理店IDを取得（1クエリ + メモリ走査）
 * @param {string} parentId - 親代理店ID
 * @returns {Promise<string[]>} 親代理店ID + 全下位代理店IDの配列
 */
async function getSubordinateAgencyIds(parentId) {
  const parentChildMap = await buildParentChildMap();
  return collectDescendantIds(parentId, parentChildMap);
}

/**
 * 指定された親代理店IDから、全ての下位代理店を詳細情報付きで取得（1クエリ）
 * @param {string} parentId - 親代理店ID
 * @returns {Promise<Object[]>} 下位代理店オブジェクトの配列（hierarchy_level付き）
 */
async function getSubordinateAgenciesWithDetails(parentId) {
  // 全代理店を1クエリで取得
  const { data: allAgencies } = await supabase
    .from('agencies')
    .select('id, company_name, tier_level, status, agency_code, contact_email, created_at, parent_agency_id');

  if (!allAgencies) return [];

  // 親子マップをメモリ内で構築
  const parentChildMap = new Map();
  const agencyById = new Map();
  for (const agency of allAgencies) {
    agencyById.set(agency.id, agency);
    const pid = agency.parent_agency_id || null;
    if (!parentChildMap.has(pid)) parentChildMap.set(pid, []);
    parentChildMap.get(pid).push(agency.id);
  }

  // BFSで階層レベル付きで収集
  const result = [];
  let queue = [{ id: parentId, level: 0 }];
  const visited = new Set([parentId]);

  while (queue.length > 0) {
    const nextQueue = [];
    for (const { id, level } of queue) {
      if (level >= MAX_RECURSION_DEPTH) continue;
      const children = parentChildMap.get(id) || [];
      for (const childId of children) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        const agency = agencyById.get(childId);
        if (agency) {
          const { parent_agency_id, ...rest } = agency;
          result.push({ ...rest, hierarchy_level: level + 1 });
        }
        nextQueue.push({ id: childId, level: level + 1 });
      }
    }
    queue = nextQueue;
  }

  return result;
}

module.exports = { getSubordinateAgencyIds, getSubordinateAgenciesWithDetails };
