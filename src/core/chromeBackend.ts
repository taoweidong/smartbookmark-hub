import type { Backend, CreateInput } from './backend';
import { SETTINGS_KEY } from './constants';
import type { BookmarkNode, Disposition } from './types';

function invoke<T>(run: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    run((value) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message ?? 'Chrome API 调用失败'));
      else resolve(value);
    });
  });
}

function invokeVoid(run: (callback: () => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    run(() => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message ?? 'Chrome API 调用失败'));
      else resolve();
    });
  });
}

export function createChromeBackend(): Backend {
  const changeListeners = new Set<() => void>();
  const settingsListeners = new Set<() => void>();
  let wired = false;

  function wire(): void {
    if (wired) return;
    wired = true;
    const fire = () => changeListeners.forEach((cb) => cb());
    chrome.bookmarks.onCreated.addListener(fire);
    chrome.bookmarks.onRemoved.addListener(fire);
    chrome.bookmarks.onChanged.addListener(fire);
    chrome.bookmarks.onMoved.addListener(fire);
    chrome.bookmarks.onChildrenReordered.addListener(fire);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SETTINGS_KEY]) {
        settingsListeners.forEach((cb) => cb());
      }
    });
  }

  return {
    kind: 'chrome',

    getTree: () => invoke<BookmarkNode[]>((cb) => chrome.bookmarks.getTree(cb)),

    create: (input: CreateInput) =>
      invoke<BookmarkNode>((cb) => chrome.bookmarks.create(input, cb)),

    update: (id, changes) => invoke<BookmarkNode>((cb) => chrome.bookmarks.update(id, changes, cb)),

    move: (id, dest) => invoke<BookmarkNode>((cb) => chrome.bookmarks.move(id, dest, cb)),

    remove: (id) => invokeVoid((cb) => chrome.bookmarks.remove(id, cb)),

    removeTree: (id) => invokeVoid((cb) => chrome.bookmarks.removeTree(id, cb)),

    search: (query) => invoke<BookmarkNode[]>((cb) => chrome.bookmarks.search(query, cb)),

    historySearch: (query, days, max) =>
      invoke<chrome.history.HistoryItem[]>((cb) =>
        chrome.history.search(
          { text: query, startTime: Date.now() - days * 86_400_000, maxResults: max },
          cb,
        ),
      ).then((items) =>
        items
          .filter((item) => Boolean(item.url))
          .map((item) => ({
            title: item.title || item.url!,
            url: item.url!,
            lastVisitTime: item.lastVisitTime ?? 0,
          })),
      ),

    async openUrl(url: string, disposition: Disposition) {
      if (disposition === 'newWindow') {
        await invoke<void>((cb) => chrome.windows.create({ url }, () => cb()));
        return;
      }
      if (disposition === 'newTab') {
        await invoke<void>((cb) => chrome.tabs.create({ url, active: true }, () => cb()));
        return;
      }
      const tabs = await invoke<chrome.tabs.Tab[]>((cb) =>
        chrome.tabs.query({ active: true, currentWindow: true }, cb),
      );
      const tabId = tabs[0]?.id;
      if (tabId === undefined) {
        await invoke<void>((cb) => chrome.tabs.create({ url, active: true }, () => cb()));
        return;
      }
      await invoke<void>((cb) => chrome.tabs.update(tabId, { url }, () => cb()));
    },

    async webSearch(text: string, disposition: 'current' | 'newTab') {
      if (chrome.search?.query) {
        await chrome.search.query({
          text,
          disposition: disposition === 'newTab' ? 'NEW_TAB' : 'CURRENT_TAB',
        });
        return;
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      await this.openUrl(url, disposition === 'newTab' ? 'newTab' : 'current');
    },

    async currentTab() {
      const tabs = await invoke<chrome.tabs.Tab[]>((cb) =>
        chrome.tabs.query({ active: true, currentWindow: true }, cb),
      );
      const tab = tabs[0];
      return tab?.url ? { title: tab.title ?? tab.url, url: tab.url } : null;
    },

    onChange(callback) {
      wire();
      changeListeners.add(callback);
      return () => changeListeners.delete(callback);
    },

    onSettingsChanged(callback) {
      wire();
      settingsListeners.add(callback);
      return () => settingsListeners.delete(callback);
    },

    hasHostPermission: () => chrome.permissions.contains({ origins: ['<all_urls>'] }),
    requestHostPermission: () => chrome.permissions.request({ origins: ['<all_urls>'] }),
    removeHostPermission: () => chrome.permissions.remove({ origins: ['<all_urls>'] }),

    openOptions: () => invokeVoid((cb) => chrome.runtime.openOptionsPage(cb)),

    async storageGet<T>(key: string) {
      const result = await chrome.storage.local.get(key);
      return result[key] as T | undefined;
    },

    storageSet: <T>(key: string, value: T) => chrome.storage.local.set({ [key]: value }),

    storageRemove: (key: string) => chrome.storage.local.remove(key),
  };
}