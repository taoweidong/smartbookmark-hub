import type { Backend, CreateInput } from './backend';
import { SETTINGS_KEY } from './constants';
import { createFixtureHistory, createFixtureTree } from './fixtures';
import type { BookmarkNode, Disposition } from './types';

export const demoOpened: { url: string; disposition: string }[] = [];

function walk(nodes: BookmarkNode[], visit: (node: BookmarkNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.children) walk(node.children, visit);
  }
}

export function createDemoBackend(seed?: BookmarkNode[]): Backend {
  let tree = seed ?? createFixtureTree();
  const history = createFixtureHistory();
  const changeListeners = new Set<() => void>();
  const settingsListeners = new Set<() => void>();
  const memory = new Map<string, unknown>();
  let idSeq = 9000;

  const emit = () => {
    queueMicrotask(() => changeListeners.forEach((cb) => cb()));
  };

  function find(id: string): BookmarkNode | undefined {
    let found: BookmarkNode | undefined;
    walk(tree, (node) => {
      if (node.id === id) found = node;
    });
    return found;
  }

  function siblings(parentId: string | undefined): BookmarkNode[] {
    if (parentId === undefined || parentId === '0') {
      return tree[0]?.children ?? [];
    }
    return find(parentId)?.children ?? [];
  }

  function reindex(list: BookmarkNode[]): void {
    list.forEach((node, index) => {
      node.index = index;
    });
  }

  function detach(id: string): BookmarkNode {
    const node = find(id);
    if (!node) throw new Error(`找不到书签节点 ${id}`);
    const list = siblings(node.parentId);
    const at = list.findIndex((item) => item.id === id);
    if (at >= 0) list.splice(at, 1);
    reindex(list);
    return node;
  }

  const storage = {
    async get<T>(key: string): Promise<T | undefined> {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (store) {
        const raw = store.getItem(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
      }
      return memory.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (store) store.setItem(key, JSON.stringify(value));
      else memory.set(key, value);
      // 与 chrome.storage.onChanged 对齐：仅设置键变化时通知设置订阅者
      if (key === SETTINGS_KEY) queueMicrotask(() => settingsListeners.forEach((cb) => cb()));
    },
    async remove(key: string): Promise<void> {
      const store = (globalThis as { localStorage?: Storage }).localStorage;
      if (store) store.removeItem(key);
      else memory.delete(key);
      if (key === SETTINGS_KEY) queueMicrotask(() => settingsListeners.forEach((cb) => cb()));
    },
  };

  return {
    kind: 'demo',

    async getTree() {
      return structuredClone(tree);
    },

    async create(input: CreateInput) {
      idSeq += 1;
      const parentId = input.parentId ?? '1';
      const parent = find(parentId);
      if (!parent) throw new Error(`父文件夹 ${parentId} 不存在`);
      if (!parent.children) parent.children = [];
      const node: BookmarkNode = {
        id: String(idSeq),
        parentId,
        title: input.title,
        url: input.url,
        dateAdded: Date.now(),
        index: input.index ?? parent.children.length,
      };
      const at = Math.min(Math.max(0, node.index!), parent.children.length);
      parent.children.splice(at, 0, node);
      reindex(parent.children);
      parent.dateGroupModified = Date.now();
      emit();
      return structuredClone(node);
    },

    async update(id, changes) {
      const node = find(id);
      if (!node) throw new Error(`找不到书签节点 ${id}`);
      if (changes.title !== undefined) node.title = changes.title;
      if (changes.url !== undefined) node.url = changes.url;
      emit();
      return structuredClone(node);
    },

    async move(id, dest) {
      const node = find(id);
      if (!node) throw new Error(`找不到书签节点 ${id}`);
      // 与 Chrome 语义对齐：先完成全部校验，再修改树，失败时不留下半完成状态
      const parentId = dest.parentId ?? node.parentId ?? '1';
      const parent = find(parentId);
      if (!parent?.children) throw new Error(`目标文件夹 ${parentId} 不存在`);
      if (parentId === id || isDescendant(node, parentId)) {
        throw new Error('不能把文件夹移动到它自己的子文件夹里');
      }
      detach(id);
      const at = Math.min(Math.max(0, dest.index ?? parent.children.length), parent.children.length);
      node.parentId = parentId;
      parent.children.splice(at, 0, node);
      reindex(parent.children);
      emit();
      return structuredClone(node);
    },

    async remove(id) {
      const node = find(id);
      if (!node) throw new Error(`找不到书签节点 ${id}`);
      if (node.children?.length) throw new Error('该文件夹非空，请使用删除整个文件夹');
      if (['0', '1', '2', '3'].includes(id)) throw new Error('不能删除 Chrome 特殊文件夹');
      detach(id);
      emit();
    },

    async removeTree(id) {
      if (['0', '1', '2', '3'].includes(id)) throw new Error('不能删除 Chrome 特殊文件夹');
      detach(id);
      emit();
    },

    async search(query) {
      const q = query.trim().toLowerCase();
      const results: BookmarkNode[] = [];
      walk(tree, (node) => {
        if (!node.url) return;
        if (!q || node.title.toLowerCase().includes(q) || node.url.toLowerCase().includes(q)) {
          results.push(structuredClone(node));
        }
      });
      return results;
    },

    async historySearch(query, days, max) {
      const q = query.trim().toLowerCase();
      const since = Date.now() - days * 86_400_000;
      return history
        .filter((item) => item.lastVisitTime >= since)
        .filter(
          (item) =>
            !q || item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q),
        )
        .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
        .slice(0, max);
    },

    async openUrl(url: string, disposition: Disposition) {
      demoOpened.push({ url, disposition });
      const view = (globalThis as { window?: Window }).window;
      view?.open(url, '_blank', 'noopener,noreferrer');
    },

    async webSearch(text: string, disposition: 'current' | 'newTab') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      demoOpened.push({ url, disposition: `web:${disposition}` });
      const view = (globalThis as { window?: Window }).window;
      view?.open(url, '_blank', 'noopener,noreferrer');
    },

    async currentTab() {
      return { title: '当前页面（演示模式）', url: 'https://developer.chrome.com/docs/extensions' };
    },

    onChange(callback) {
      changeListeners.add(callback);
      return () => changeListeners.delete(callback);
    },

    onSettingsChanged(callback) {
      settingsListeners.add(callback);
      return () => settingsListeners.delete(callback);
    },

    async hasHostPermission() {
      return true;
    },
    async requestHostPermission() {
      return true;
    },
    async removeHostPermission() {
      return true;
    },

    async openOptions() {
      const view = (globalThis as { window?: Window }).window;
      view?.open('options.html', '_blank', 'noopener,noreferrer');
    },

    storageGet: storage.get,
    storageSet: storage.set,
    storageRemove: storage.remove,
  };
}

function isDescendant(node: BookmarkNode, candidateId: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.id === candidateId || isDescendant(child, candidateId)) return true;
  }
  return false;
}