import { getBackend } from './backend';
import { ROOT_ID, SPECIAL_FOLDER_IDS } from './constants';
import type { BookmarkNode, FlatBookmark } from './types';
import { hostOf } from './url';

export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

export function flattenTree(nodes: BookmarkNode[]): FlatBookmark[] {
  const out: FlatBookmark[] = [];

  const visit = (node: BookmarkNode, path: string[]) => {
    if (node.url) {
      out.push({
        id: node.id,
        title: node.title || hostOf(node.url) || node.url,
        url: node.url,
        parentId: node.parentId ?? ROOT_ID,
        folderPath: path,
        dateAdded: node.dateAdded ?? 0,
      });
      return;
    }
    if (!node.children) return;
    const nextPath = node.id === ROOT_ID ? path : [...path, node.title || '未命名文件夹'];
    for (const child of node.children) visit(child, nextPath);
  };

  for (const node of nodes) visit(node, []);
  return out;
}

export function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function folderPathOf(nodes: BookmarkNode[], id: string): string[] {
  const path: string[] = [];
  let current = findNode(nodes, id);
  while (current && current.parentId && current.parentId !== ROOT_ID) {
    const parent = findNode(nodes, current.parentId);
    if (!parent) break;
    path.unshift(parent.title || '未命名文件夹');
    current = parent;
  }
  return path;
}

export interface FolderInfo {
  id: string;
  title: string;
  parentId?: string;
  depth: number;
  path: string[];
  directCount: number;
  totalCount: number;
  special: boolean;
}

export function collectFolders(nodes: BookmarkNode[]): FolderInfo[] {
  const out: FolderInfo[] = [];

  // 单次 DFS 自底向上累计 totalCount，避免每个文件夹重复遍历子树（嵌套链最坏 O(n²)）
  const visit = (node: BookmarkNode, depth: number, path: string[]): number => {
    if (node.url) return 1;
    if (node.id === ROOT_ID) {
      let rootTotal = 0;
      for (const child of node.children ?? []) rootTotal += visit(child, depth, path);
      return rootTotal;
    }
    const title = node.title || '未命名文件夹';
    const info: FolderInfo = {
      id: node.id,
      title,
      parentId: node.parentId,
      depth,
      path: [...path, title],
      directCount: 0,
      totalCount: 0,
      special: SPECIAL_FOLDER_IDS.includes(node.id),
    };
    out.push(info);

    const children = node.children ?? [];
    let total = 0;
    let direct = 0;
    for (const child of children) {
      if (child.url) {
        direct += 1;
        total += 1;
        continue;
      }
      total += visit(child, depth + 1, info.path);
    }
    info.directCount = direct;
    info.totalCount = total;
    return total;
  };

  for (const node of nodes) visit(node, 0, []);
  return out;
}

export function countBookmarks(nodes: BookmarkNode[]): number {
  let total = 0;
  const visit = (node: BookmarkNode) => {
    if (node.url) total += 1;
    else for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  return total;
}

export function bookmarksInFolder(nodes: BookmarkNode[], folderId: string): FlatBookmark[] {
  const folder = findNode(nodes, folderId);
  if (!folder) return [];
  return flattenTree([folder]);
}

export const bookmarkService = {
  getTree: () => getBackend().getTree(),

  async getFlat(): Promise<FlatBookmark[]> {
    return flattenTree(await getBackend().getTree());
  },

  create: (input: { parentId?: string; index?: number; title: string; url?: string }) =>
    getBackend().create(input),

  update: (id: string, changes: { title?: string; url?: string }) =>
    getBackend().update(id, changes),

  move: (id: string, dest: { parentId?: string; index?: number }) => getBackend().move(id, dest),

  async remove(id: string): Promise<void> {
    const tree = await getBackend().getTree();
    const node = findNode(tree, id);
    if (!node) return;
    if (isFolder(node)) await getBackend().removeTree(id);
    else await getBackend().remove(id);
  },

  removeMany: async (ids: string[]) => {
    // 只取一次树，文件夹/书签分组后分别批量删除；被选中祖先覆盖的子文件夹交给 removeTree 连带删除
    const tree = await getBackend().getTree();
    const selected = new Set(ids);
    const leaves: string[] = [];
    const folders: string[] = [];
    for (const id of ids) {
      const node = findNode(tree, id);
      if (!node) continue;
      if (!isFolder(node)) {
        leaves.push(id);
        continue;
      }
      let parentId = node.parentId;
      let covered = false;
      while (parentId) {
        if (selected.has(parentId)) {
          covered = true;
          break;
        }
        parentId = findNode(tree, parentId)?.parentId;
      }
      if (!covered) folders.push(id);
    }
    for (const id of leaves) await getBackend().remove(id);
    for (const id of folders) await getBackend().removeTree(id);
  },

  search: (query: string) => getBackend().search(query),

  onChange: (callback: () => void) => getBackend().onChange(callback),
};