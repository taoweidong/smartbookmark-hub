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

  const countDeep = (node: BookmarkNode): number => {
    let total = 0;
    for (const child of node.children ?? []) {
      total += child.url ? 1 : countDeep(child);
    }
    return total;
  };

  const visit = (node: BookmarkNode, depth: number, path: string[]) => {
    if (node.url || node.id === ROOT_ID) {
      for (const child of node.children ?? []) visit(child, depth, path);
      return;
    }
    const title = node.title || '未命名文件夹';
    const children = node.children ?? [];
    out.push({
      id: node.id,
      title,
      parentId: node.parentId,
      depth,
      path: [...path, title],
      directCount: children.filter((child) => Boolean(child.url)).length,
      totalCount: countDeep(node),
      special: SPECIAL_FOLDER_IDS.includes(node.id),
    });
    const nextPath = [...path, title];
    for (const child of children) visit(child, depth + 1, nextPath);
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

  removeMany: async (ids: string[]): Promise<void> => {
    for (const id of ids) await bookmarkService.remove(id);
  },

  search: (query: string) => getBackend().search(query),

  onChange: (callback: () => void) => getBackend().onChange(callback),
};