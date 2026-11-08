import { bookmarkService, findNode } from './bookmarks';
import { CACHE_PREFIX, cache } from './cache';
import { MAX_TRASH_BATCHES, MAX_TRASH_NODES, SPECIAL_FOLDER_IDS } from './constants';
import { uid } from './format';
import type { BookmarkNode, TrashBatch, TrashNode } from './types';

function parentTitlesOf(tree: BookmarkNode[], parentId: string | undefined): string[] {
  const titles: string[] = [];
  let current = parentId ? findNode(tree, parentId) : undefined;
  while (current && current.parentId && current.id !== '0') {
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

  for (const node of nodes) {
    await bookmarkService.remove(node.id);
  }

  return batch;
}

async function ensureParent(
  node: TrashNode,
  fallbackCounter: { value: number },
): Promise<string> {
  const tree = await bookmarkService.getTree();
  if (findNode(tree, node.parentId)) return node.parentId;

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
    const anchor = findByTitle(tree, titles[0]);
    if (anchor) {
      parentId = anchor.id;
      titles = titles.slice(1);
    }
  }

  for (const title of titles) {
    const current = await bookmarkService.getTree();
    const parent = findNode(current, parentId);
    const existing = parent?.children?.find((child) => !child.url && child.title === title);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created = await bookmarkService.create({ parentId, title });
    parentId = created.id;
    fallbackCounter.value += 1;
  }
  return parentId;
}

async function recreate(node: TrashNode, parentId: string): Promise<number> {
  const created = await bookmarkService.create({
    parentId,
    index: node.index,
    title: node.title,
    url: node.url,
  });
  let total = 1;
  for (const child of node.children ?? []) {
    total += await recreate(child, created.id);
  }
  return total;
}

export async function restoreBatch(
  batchId: string,
): Promise<{ restored: number; fallback: number }> {
  const batch = await cache.get<TrashBatch>(CACHE_PREFIX.trash + batchId);
  if (!batch) throw new Error('回收站中找不到该批次');

  const fallbackCounter = { value: 0 };
  let restored = 0;

  for (const node of batch.nodes) {
    const parentId = await ensureParent(node, fallbackCounter);
    restored += await recreate(node, parentId);
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