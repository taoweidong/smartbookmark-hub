import { ROOT_ID, SPECIAL_FOLDER_IDS } from '../constants';
import type { BookmarkNode, EmptyFolderRef } from '../types';

export function findEmptyFolders(tree: BookmarkNode[]): EmptyFolderRef[] {
  const emptyIds = new Set<string>();

  const compute = (node: BookmarkNode): boolean => {
    if (node.url) return false;
    const children = node.children ?? [];
    const childStates = children.map((child) => compute(child));
    const empty = childStates.every(Boolean);
    if (empty && node.id !== ROOT_ID && !SPECIAL_FOLDER_IDS.includes(node.id)) {
      emptyIds.add(node.id);
    }
    return empty;
  };

  for (const node of tree) compute(node);

  const out: EmptyFolderRef[] = [];
  const collect = (node: BookmarkNode, path: string[], ancestorEmpty: boolean) => {
    if (node.url) return;
    const selfEmpty = emptyIds.has(node.id);
    const nextPath = node.id === ROOT_ID ? path : [...path, node.title || '未命名文件夹'];
    if (selfEmpty && !ancestorEmpty) {
      out.push({ id: node.id, title: node.title || '未命名文件夹', path: nextPath });
    }
    for (const child of node.children ?? []) collect(child, nextPath, ancestorEmpty || selfEmpty);
  };

  for (const node of tree) collect(node, [], false);
  return out;
}