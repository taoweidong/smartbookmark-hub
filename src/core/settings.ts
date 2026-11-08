import { getBackend } from './backend';
import { SETTINGS_KEY } from './constants';
import type { Settings } from './types';

export const DEFAULT_TAB_ID = 'tab-default';

export function defaultSettings(): Settings {
  return {
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
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.accent !== undefined ? { accent: patch.accent } : {}),
    dashboard: { ...base.dashboard, ...(patch.dashboard ?? {}) },
    search: { ...base.search, ...(patch.search ?? {}) },
    scan: { ...base.scan, ...(patch.scan ?? {}) },
    tags: patch.tags ?? base.tags,
    recentQueries: patch.recentQueries ?? base.recentQueries,
  };
}

function normalize(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  return mergeSettings(base, raw as SettingsPatch);
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getBackend().storageGet<Settings>(SETTINGS_KEY);
  return normalize(raw);
}

export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await loadSettings();
  const next = mergeSettings(current, patch);
  await getBackend().storageSet(SETTINGS_KEY, next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const next = defaultSettings();
  await getBackend().storageSet(SETTINGS_KEY, next);
  return next;
}

export function subscribeSettings(callback: () => void): () => void {
  return getBackend().onSettingsChanged(callback);
}

export async function rememberQuery(query: string): Promise<Settings> {
  const trimmed = query.trim();
  if (!trimmed) return loadSettings();
  const current = await loadSettings();
  const recent = [trimmed, ...current.recentQueries.filter((q) => q !== trimmed)].slice(0, 8);
  return saveSettings({ recentQueries: recent });
}

export async function setTags(bookmarkId: string, tags: string[]): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current.tags };
  const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  if (cleaned.length) next[bookmarkId] = cleaned;
  else delete next[bookmarkId];
  return saveSettings({ tags: next });
}