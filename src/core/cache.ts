import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import { DB_NAME } from './constants';

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
    const found = await cache.keys(prefix);
    const out: [string, T][] = [];
    for (const key of found) {
      const value = await cache.get<T>(key);
      if (value !== undefined) out.push([key, value]);
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

export function resetCacheForTests(): void {
  idb = null;
  memory = null;
}