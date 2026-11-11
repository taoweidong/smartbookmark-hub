import { getBackend } from './backend';
import { SETTINGS_KEY } from './constants';
import type { Settings } from './types';

export const DEFAULT_TAB_ID = 'tab-default';

/** 设置结构版本：结构变更时递增，并在 migrate() 补对应迁移分支 */
export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    theme: 'dark',
    accent: 'gilt',
    dashboard: {
      tabs: [{ id: DEFAULT_TAB_ID, name: '常用', folderIds: [] }],
      activeTabId: DEFAULT_TAB_ID,
      layout: 'grid',
      cardSize: 'md',
      sort: 'default',
      perFolder: 8,
      showStats: true,
      viewBarOpen: false,
      seeded: false,
      background: { type: 'aurora', value: '' },
    },
    search: {
      includeHistory: true,
      historyDays: 90,
      maxResults: 30,
      debounceMs: 300,
    },
    scan: {
      concurrency: 5,
      timeoutMs: 8000,
      hostDelayMs: 250,
      cacheDays: 7,
      ignoreWww: true,
      titleThreshold: 0.86,
    },
    tags: {},
    recentQueries: [],
  };
}

export interface SettingsPatch {
  theme?: Settings['theme'];
  accent?: Settings['accent'];
  dashboard?: Partial<Settings['dashboard']>;
  search?: Partial<Settings['search']>;
  scan?: Partial<Settings['scan']>;
  tags?: Record<string, string[]>;
  recentQueries?: string[];
}

export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return {
    ...base,
    version: SETTINGS_VERSION,
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.accent !== undefined ? { accent: patch.accent } : {}),
    dashboard: { ...base.dashboard, ...(patch.dashboard ?? {}) },
    search: { ...base.search, ...(patch.search ?? {}) },
    scan: { ...base.scan, ...(patch.scan ?? {}) },
    tags: patch.tags ?? base.tags,
    recentQueries: patch.recentQueries ?? base.recentQueries,
  };
}

/**
 * 版本迁移入口。
 * - 已是当前版本：原样交给形状防御
 * - 无 version（0.1.0 存量数据）：v0 → v1 形状完全兼容，仅补齐版本标记
 * - 高于当前版本：说明数据由更新版本写入，旧代码不认识，回退默认避免误写破坏
 */
export function migrateSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const source = raw as { version?: unknown };
  if (source.version === SETTINGS_VERSION) return raw;
  if (typeof source.version === 'number' && source.version > SETTINGS_VERSION) return undefined;
  return { ...source, version: SETTINGS_VERSION };
}

function normalize(raw: unknown): Settings {
  const base = defaultSettings();
  const migrated = migrateSettings(raw);
  if (!migrated || typeof migrated !== 'object') return base;
  const next = mergeSettings(base, migrated as SettingsPatch);

  // 形状防御：storage 被手改或旧损坏备份写入非法结构时回退默认，防 UI 白屏（v2 R4.7）
  const tabs = Array.isArray(next.dashboard.tabs)
    ? next.dashboard.tabs.filter(
        (tab) =>
          !!tab &&
          typeof tab === 'object' &&
          typeof tab.id === 'string' &&
          typeof tab.name === 'string' &&
          Array.isArray(tab.folderIds) &&
          tab.folderIds.every((id) => typeof id === 'string'),
      )
    : [];
  next.dashboard.tabs = tabs.length ? tabs : base.dashboard.tabs;
  if (!next.dashboard.tabs.some((tab) => tab.id === next.dashboard.activeTabId)) {
    next.dashboard.activeTabId = next.dashboard.tabs[0].id;
  }
  next.dashboard.viewBarOpen = next.dashboard.viewBarOpen === true;
  const background = next.dashboard.background as unknown;
  if (
    !background ||
    typeof background !== 'object' ||
    !['aurora', 'solid', 'image'].includes((background as { type?: string }).type ?? '')
  ) {
    next.dashboard.background = base.dashboard.background;
  }

  const tags: Record<string, string[]> = {};
  if (next.tags && typeof next.tags === 'object') {
    for (const [key, value] of Object.entries(next.tags)) {
      if (Array.isArray(value) && value.length > 0 && value.every((tag) => typeof tag === 'string')) {
        tags[key] = value;
      }
    }
  }
  next.tags = tags;

  next.recentQueries = Array.isArray(next.recentQueries)
    ? next.recentQueries.filter((query) => typeof query === 'string')
    : [];
  return next;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getBackend().storageGet<Settings>(SETTINGS_KEY);
  return normalize(raw);
}

/**
 * 设置写入统一走串行队列：每次都基于「队列轮到自己时」的最新存储值合并，
 * 再一次性写回。避免多个页面组件并发 saveSettings / setTags / rememberQuery 时
 * 各自读到同一份旧值、后写者覆盖先写者的丢失更新。
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  // 单个任务失败不能把队列卡死（catch 后队列保持 resolved）
  writeQueue = result.catch(() => undefined);
  return result;
}

function writeSettings(transform: (current: Settings) => Settings): Promise<Settings> {
  return enqueue(async () => {
    const current = await loadSettings();
    const next = transform(current);
    await getBackend().storageSet(SETTINGS_KEY, next);
    return next;
  });
}

export function saveSettings(patch: SettingsPatch): Promise<Settings> {
  return writeSettings((current) => mergeSettings(current, patch));
}

export function resetSettings(): Promise<Settings> {
  return writeSettings(() => defaultSettings());
}

export function subscribeSettings(callback: () => void): () => void {
  return getBackend().onSettingsChanged(callback);
}

export function rememberQuery(query: string): Promise<Settings> {
  const trimmed = query.trim();
  if (!trimmed) return loadSettings();
  return writeSettings((current) => {
    const recent = [trimmed, ...current.recentQueries.filter((q) => q !== trimmed)].slice(0, 8);
    return mergeSettings(current, { recentQueries: recent });
  });
}

export function setTags(bookmarkId: string, tags: string[]): Promise<Settings> {
  return writeSettings((current) => {
    const next = { ...current.tags };
    const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    if (cleaned.length) next[bookmarkId] = cleaned;
    else delete next[bookmarkId];
    return mergeSettings(current, { tags: next });
  });
}
