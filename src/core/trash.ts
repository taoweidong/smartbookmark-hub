import { bookmarkService, findNode } from './bookmarks';
import { CACHE_PREFIX, cache } from './cache';
import { MAX_TRASH_BATCHES, MAX_TRASH_NODES, ROOT_ID, SPECIAL_FOLDER_IDS } from './constants';
import { uid } from './format';
import type { BookmarkNode, TrashBatch, TrashNode } from './types';

function parentTitlesOf(tree: BookmarkNode[], parentId: string | undefined): string[] {
  const titles: string[] = [];
  let current = parentId ? findNode(tree, parentId) : undefined;
  while (current && current.parentId && current.id !== ROOT_ID) {
    titles.unshift(current.title || '未命名文件夹');
    current = findNode(tree, current.parentId);
  }
  return titles;
}

function toTrashNode(tree: BookmarkNode[], node: BookmarkNode): TrashNode {
  const parentId = node.parentId ?? '2';
  return {
    id: node.id,
    title: node.title,
    url: node.url,
    parentId,
    parentTitles: parentTitlesOf(tree, node.parentId),
    index: node.index ?? 0,
    dateAdded: node.dateAdded,
    children: node.children?.map((child) => toTrashNode(tree, child)),
  };
}

export function snapshotNodes(tree: BookmarkNode[], ids: string[]): TrashNode[] {
  const wanted = ids.filter((id) => !SPECIAL_FOLDER_IDS.includes(id));
  const selected = new Set(wanted);

  const hasSelectedAncestor = (node: BookmarkNode): boolean => {
    let parentId = node.parentId;
    while (parentId && parentId !== '0') {
      if (selected.has(parentId)) return true;
      parentId = findNode(tree, parentId)?.parentId;
    }
    return false;
  };

  const out: TrashNode[] = [];
  for (const id of wanted) {
    const node = findNode(tree, id);
    if (!node || hasSelectedAncestor(node)) continue;
    out.push(toTrashNode(tree, node));
  }
  return out;
}

function countNodes(nodes: TrashNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
}

async function writeBatch(batch: TrashBatch): Promise<void> {
  await cache.set(CACHE_PREFIX.trash + batch.id, batch);
  let batches = await listTrash();

  while (batches.length > MAX_TRASH_BATCHES) {
    const oldest = batches[batches.length - 1];
    await cache.del(CACHE_PREFIX.trash + oldest.id);
    batches = batches.slice(0, -1);
  }

  let total = batches.reduce((sum, item) => sum + countNodes(item.nodes), 0);
  while (total > MAX_TRASH_NODES && batches.length > 1) {
    const oldest = batches[batches.length - 1];
    await cache.del(CACHE_PREFIX.trash + oldest.id);
    total -= countNodes(oldest.nodes);
    batches = batches.slice(0, -1);
  }
}

export async function listTrash(): Promise<TrashBatch[]> {
  const entries = await cache.entries<TrashBatch>(CACHE_PREFIX.trash);
  return entries.map(([, batch]) => batch).sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function deleteWithUndo(ids: string[], label: string): Promise<TrashBatch> {
  const tree = await bookmarkService.getTree();
  const nodes = snapshotNodes(tree, ids);
  if (!nodes.length) throw new Error('没有可删除的书签');

  const batch: TrashBatch = { id: uid('trash'), deletedAt: Date.now(), label, nodes };
  await writeBatch(batch);

  const deleted: TrashNode[] = [];
  try {
    for (const node of nodes) {
      await bookmarkService.remove(node.id);
      deleted.push(node);
    }
  } catch (error) {
    // 部分失败：批次只保留真正删除成功的节点，避免恢复时产生重复
    batch.nodes = deleted;
    if (deleted.length) await writeBatch(batch);
    else await cache.del(CACHE_PREFIX.trash + batch.id);
    throw error;
  }

  return batch;
}

async function ensureParent(
  node: TrashNode,
  fallbackCounter: { value: number },
  createdIds: string[],
  treeRef: { current: BookmarkNode[] },
): Promise<string> {
  if (findNode(treeRef.current, node.parentId)) return node.parentId;

  let parentId = '2';
  let titles = node.parentTitles;

  const findByTitle = (nodes: BookmarkNode[], title: string): BookmarkNode | undefined => {
    for (const candidate of nodes) {
      if (!candidate.url && candidate.title === title) return candidate;
      const found = candidate.children ? findByTitle(candidate.children, title) : undefined;
      if (found) return found;
    }
    return undefined;
  };

  if (titles.length) {
    const anchor = findByTitle(treeRef.current, titles[0]);
    if (anchor) {
      parentId = anchor.id;
      titles = titles.slice(1);
    }
  }

  for (const title of titles) {
    const parent = findNode(treeRef.current, parentId);
    const existing = parent?.children?.find((child) => !child.url && child.title === title);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created = await bookmarkService.create({ parentId, title });
    // 兜底重建的文件夹同样登记进 createdIds：恢复中断时一并补偿，不留垃圾空文件夹
    createdIds.push(created.id);
    fallbackCounter.value += 1;
    treeRef.current = await bookmarkService.getTree();
    parentId = created.id;
  }
  return parentId;
}

async function recreate(
  node: TrashNode,
  parentId: string,
  createdIds: string[],
  treeRef: { current: BookmarkNode[] },
): Promise<number> {
  // Chrome 对越界 index 会报 "Index out of bounds"，恢复前按当前兄弟数量收敛
  const parent = findNode(treeRef.current, parentId);
  const index = Math.max(0, Math.min(node.index, parent?.children?.length ?? 0));
  const created = await bookmarkService.create({
    parentId,
    index,
    title: node.title,
    url: node.url,
  });
  createdIds.push(created.id);
  treeRef.current = await bookmarkService.getTree();
  let total = 1;
  for (const child of node.children ?? []) {
    total += await recreate(child, created.id, createdIds, treeRef);
  }
  return total;
}

export async function restoreBatch(
  batchId: string,
): Promise<{ restored: number; fallback: number }> {
  const batch = await cache.get<TrashBatch>(CACHE_PREFIX.trash + batchId);
  if (!batch) throw new Error('回收站中找不到该批次');

  const fallbackCounter = { value: 0 };
  const createdIds: string[] = [];
  // 共享一份树快照，创建后同步刷新：替代每节点一次全树读取
  const treeRef = { current: await bookmarkService.getTree() };
  let restored = 0;

  try {
    for (const node of batch.nodes) {
      const parentId = await ensureParent(node, fallbackCounter, createdIds, treeRef);
      restored += await recreate(node, parentId, createdIds, treeRef);
    }
  } catch (error) {
    // 恢复中断：补偿已创建的节点（含兜底重建的父文件夹），保留批次供用户重试（幂等）
    for (const id of createdIds) {
      await bookmarkService.remove(id).catch(() => {});
    }
    throw error;
  }

  await cache.del(CACHE_PREFIX.trash + batchId);
  return { restored, fallback: fallbackCounter.value };
}

export async function purgeBatch(batchId: string): Promise<void> {
  await cache.del(CACHE_PREFIX.trash + batchId);
}

export async function purgeAll(): Promise<void> {
  await cache.clear(CACHE_PREFIX.trash);
}