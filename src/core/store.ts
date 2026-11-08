import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { getBackend } from './backend';
import { bookmarkService, collectFolders, countBookmarks, flattenTree, type FolderInfo } from './bookmarks';
import { UNDO_WINDOW_MS } from './constants';
import { uid } from './format';
import { buildEntries, searchAll } from './search';
import { defaultSettings, loadSettings, saveSettings, subscribeSettings, type SettingsPatch } from './settings';
import type { BookmarkNode, FlatBookmark, SearchEntry, SearchResult, Settings, Toast } from './types';

export interface AppState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  demo: boolean;
  tree: BookmarkNode[];
  flat: FlatBookmark[];
  entries: SearchEntry[];
  folders: FolderInfo[];
  totalCount: number;
  settings: Settings;
  query: string;
  results: SearchResult[];
  searching: boolean;
  selectedIds: string[];
  toasts: Toast[];
}

export interface AppActions {
  init(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(query: string): void;
  runSearch(query: string): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<void>;
  toggleSelected(id: string, additive?: boolean): void;
  selectMany(ids: string[]): void;
  clearSelection(): void;
  pushToast(toast: Omit<Toast, 'id' | 'createdAt'>): string;
  dismissToast(id: string): void;
  mutate(label: string, action: () => Promise<void>): Promise<boolean>;
}

export type AppStore = AppState & AppActions;

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeBookmarks: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;

function initialState(): AppState {
  return {
    initialized: false,
    loading: true,
    error: null,
    demo: getBackend().kind === 'demo',
    tree: [],
    flat: [],
    entries: [],
    folders: [],
    totalCount: 0,
    settings: defaultSettings(),
    query: '',
    results: [],
    searching: false,
    selectedIds: [],
    toasts: [],
  };
}

export const store = createStore<AppStore>()((set, get) => ({
  ...initialState(),

  async init() {
    if (get().initialized) return;
    set({ initialized: true });

    try {
      const settings = await loadSettings();
      set({ settings });
      await get().refresh();

      if (!settings.dashboard.seeded) {
        const folders = get().folders.filter((folder) => !folder.special && folder.totalCount > 0);
        const preferred = folders.filter((folder) => folder.depth === 1);
        const picked = (preferred.length ? preferred : folders).slice(0, 6).map((folder) => folder.id);
        const tabs = settings.dashboard.tabs.map((tab) =>
          tab.id === settings.dashboard.activeTabId ? { ...tab, folderIds: picked } : tab,
        );
        const next = await saveSettings({ dashboard: { tabs, seeded: true } });
        set({ settings: next });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '初始化失败', loading: false });
    }

    unsubscribeBookmarks?.();
    unsubscribeBookmarks = bookmarkService.onChange(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void get().refresh();
      }, 400);
    });

    unsubscribeSettings?.();
    unsubscribeSettings = subscribeSettings(() => {
      void loadSettings().then((settings) => set({ settings }));
    });
  },

  async refresh() {
    const first = get().tree.length === 0;
    if (first) set({ loading: true });
    try {
      const tree = await bookmarkService.getTree();
      const flat = flattenTree(tree);
      const folders = collectFolders(tree);
      const entries = await buildEntries(flat, get().settings.tags);
      set({
        tree,
        flat,
        folders,
        entries,
        totalCount: countBookmarks(tree),
        loading: false,
        error: null,
        selectedIds: get().selectedIds.filter((id) => flat.some((item) => item.id === id) || folders.some((f) => f.id === id)),
      });
      const query = get().query;
      if (query.trim()) await get().runSearch(query);
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '读取书签失败' });
    }
  },

  setQuery(query) {
    set({ query });
    if (!query.trim()) set({ results: [], searching: false });
  },

  async runSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      set({ results: [], searching: false });
      return;
    }
    set({ searching: true });
    const { entries, settings } = get();
    try {
      const results = await searchAll(entries, trimmed, {
        includeHistory: settings.search.includeHistory,
        historyDays: settings.search.historyDays,
        limit: settings.search.maxResults,
      });
      if (get().query.trim() === trimmed) set({ results, searching: false });
      else set({ searching: false });
    } catch {
      set({ results: [], searching: false });
    }
  },

  async updateSettings(patch) {
    const next = await saveSettings(patch);
    set({ settings: next });
    if (patch.tags) {
      const entries = await buildEntries(get().flat, next.tags);
      set({ entries });
    }
  },

  toggleSelected(id, additive = false) {
    const current = get().selectedIds;
    if (!additive) {
      set({ selectedIds: current.includes(id) && current.length === 1 ? [] : [id] });
      return;
    }
    set({
      selectedIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    });
  },

  selectMany(ids) {
    set({ selectedIds: [...new Set(ids)] });
  },

  clearSelection() {
    set({ selectedIds: [] });
  },

  pushToast(toast) {
    const id = uid('toast');
    const entry: Toast = { ...toast, id, createdAt: Date.now() };
    set({ toasts: [...get().toasts, entry].slice(-4) });
    const timer = setTimeout(() => get().dismissToast(id), toast.undo ? UNDO_WINDOW_MS : 4200);
    toastTimers.set(id, timer);
    return id;
  },

  dismissToast(id) {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  async mutate(label, action) {
    try {
      await action();
      await get().refresh();
      if (label) get().pushToast({ message: label, tone: 'success' });
      return true;
    } catch (error) {
      get().pushToast({
        message: error instanceof Error ? error.message : '操作失败',
        tone: 'danger',
      });
      return false;
    }
  },
}));

export function useApp<T>(selector: (state: AppStore) => T): T {
  return useStore(store, selector);
}

export function activeTab(state: AppState) {
  return (
    state.settings.dashboard.tabs.find((tab) => tab.id === state.settings.dashboard.activeTabId) ??
    state.settings.dashboard.tabs[0]
  );
}

export function teardownStore(): void {
  unsubscribeBookmarks?.();
  unsubscribeSettings?.();
  unsubscribeBookmarks = null;
  unsubscribeSettings = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  for (const timer of toastTimers.values()) clearTimeout(timer);
  toastTimers.clear();
  store.setState({ ...initialState(), loading: false });
}