import type { Backend, CreateInput } from '@/core/backend';
import { ROOT_ID } from '@/core/constants';
import type { BookmarkNode } from '@/core/types';

// 模拟 Chrome 的关键失败语义：create 对越界 index 抛 "Index out of bounds"、
// remove 不能删非空文件夹。demo 后端会静默 clamp，无法暴露这类恢复 bug。
export function createChromeLikeBackend(seed: BookmarkNode[]): Backend {
  let seq = 100;
  const tree = structuredClone(seed);

  const find = (nodes: BookmarkNode[], id: string): BookmarkNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = node.children ? find(node.children, id) : undefined;
      if (found) return found;
    }
    return undefined;
  };

  const detach = (id: string): BookmarkNode => {
    const node = find(tree, id);
    if (!node) throw new Error(`Can't find bookmark for id ${id}.`);
    const parent = node.parentId ? find(tree, node.parentId) : undefined;
    const list = parent?.children ?? [];
    const at = list.findIndex((item) => item.id === id);
    if (at >= 0) list.splice(at, 1);
    return node;
  };

  return {
    kind: 'chrome',

    async getTree() {
      return structuredClone(tree);
    },

    async create(input: CreateInput) {
      const parentId = input.parentId ?? '1';
      const parent = find(tree, parentId);
      if (!parent) throw new Error(`Can't find parent ${parentId}.`);
      if (parent.url) throw new Error('Cannot create bookmark inside a bookmark.');
      const children = parent.children ?? [];
      if (input.index !== undefined && (input.index < 0 || input.index > children.length)) {
        throw new Error('Index out of bounds.');
      }
      const node: BookmarkNode = {
        id: String((seq += 1)),
        parentId,
        title: input.title,
        url: input.url,
        dateAdded: Date.now(),
        index: input.index ?? children.length,
      };
      children.splice(node.index!, 0, node);
      parent.children = children;
      return structuredClone(node);
    },

    async update(id, changes) {
      const node = find(tree, id);
      if (!node) throw new Error(`Can't find bookmark for id ${id}.`);
      if (changes.title !== undefined) node.title = changes.title;
      if (changes.url !== undefined) node.url = changes.url;
      return structuredClone(node);
    },

    async move(id, dest) {
      const node = find(tree, id);
      if (!node) throw new Error(`Can't find bookmark for id ${id}.`);
      const parentId = dest.parentId ?? node.parentId ?? ROOT_ID;
      const parent = find(tree, parentId);
      if (!parent) throw new Error(`Can't find parent ${parentId}.`);
      detach(id);
      const children = parent.children ?? [];
      const at = Math.min(Math.max(0, dest.index ?? children.length), children.length);
      node.parentId = parentId;
      children.splice(at, 0, node);
      parent.children = children;
      return structuredClone(node);
    },

    async remove(id) {
      const node = find(tree, id);
      if (!node) throw new Error(`Can't find bookmark for id ${id}.`);
      if (node.children?.length) throw new Error("Can't remove folder.");
      detach(id);
    },

    async removeTree(id) {
      if (!find(tree, id)) throw new Error(`Can't find bookmark for id ${id}.`);
      detach(id);
    },

    search: async () => [],
    historySearch: async () => [],
    openUrl: async () => {},
    webSearch: async () => {},
    currentTab: async () => null,
    isTabContext: async () => false,
    onChange: () => () => {},
    onSettingsChanged: () => () => {},
    hasHostPermission: async () => true,
    requestHostPermission: async () => true,
    removeHostPermission: async () => true,
    openOptions: async () => {},
    openHub: async () => {},
    storageGet: async () => undefined,
    storageSet: async () => {},
    storageRemove: async () => {},
  };
}
