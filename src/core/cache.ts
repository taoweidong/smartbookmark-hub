import { createStore, del, get, getMany, keys, set, type UseStore } from 'idb-keyval';
import { DB_NAME } from './constants';
import { canonicalUrl } from './url';

let idb: UseStore | null = null;
let memory: Map<string, unknown> | null = null;

function store(): UseStore | null {
  const g = globalThis as { indexedDB?: IDBFactory };
  if (!g.indexedDB) return null;
  if (!idb) idb = createStore(DB_NAME, 'kv');
  return idb;
}

function mem(): Map<string, unknown> {
  if (!memory) memory = new Map();
  return memory;
}

export const cache = {
  async get<T>(key: string): Promise<T | undefined> {
    const db = store();
    if (db) return (await get<T>(key, db)) as T | undefined;
    const value = mem().get(key);
    return value === undefined ? undefined : (structuredClone(value) as T);
  },

  async set<T>(key: string, value: T): Promise<void> {
    const db = store();
    if (db) {
      await set(key, value, db);
      return;
    }
    mem().set(key, structuredClone(value));
  },

  async del(key: string): Promise<void> {
    const db = store();
    if (db) {
      await del(key, db);
      return;
    }
    mem().delete(key);
  },

  async keys(prefix = ''): Promise<string[]> {
    const db = store();
    const all = db ? ((await keys(db)) as string[]) : [...mem().keys()];
    return all.filter((key) => key.startsWith(prefix));
  },

  async entries<T>(prefix: string): Promise<[string, T][]> {
    const db = store();
    if (db) {
      // 一次 keys + 一次 getMany，避免逐 key 读取
      const all = (await keys(db)) as string[];
      const found = all.filter((key) => key.startsWith(prefix));
      const values = (await getMany<T>(found, db)) as (T | undefined)[];
      const out: [string, T][] = [];
      for (let i = 0; i < found.length; i += 1) {
        const value = values[i];
        if (value !== undefined) out.push([found[i], value]);
      }
      return out;
    }
    const out: [string, T][] = [];
    for (const [key, raw] of mem()) {
      if (key.startsWith(prefix)) out.push([key, structuredClone(raw) as T]);
    }
    return out;
  },

  async clear(prefix?: string): Promise<void> {
    if (prefix === undefined) {
      const db = store();
      if (db) {
        const all = (await keys(db)) as string[];
        for (const key of all) await del(key, db);
        return;
      }
      mem().clear();
      return;
    }
    for (const key of await cache.keys(prefix)) await cache.del(key);
  },
};

export const CACHE_PREFIX = {
  health: 'health:',
  report: 'report:',
  trash: 'trash:',
  asset: 'asset:',
  index: 'index:',
} as const;

/**
 * 健康缓存 key 的唯一构造入口。
 * 读取方（useHealth + 各页面）统一用 canonicalUrl(url)（默认不剥 www）查询，
 * 因此键不能受扫描选项 ignoreWww 影响 —— 读取时无法还原写入时的选项。
 */
export function healthKey(url: string): string {
  return CACHE_PREFIX.health + canonicalUrl(url);
}

/** 与 healthKey 配套的反解，把缓存 key 还原为页面查询用的 canonicalUrl */
export function healthUrlFromKey(key: string): string {
  return key.slice(CACHE_PREFIX.health.length);
}

export function resetCacheForTests(): void {
  idb = null;
  memory = null;
}