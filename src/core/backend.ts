import type { BookmarkNode, Disposition, HistoryItem } from './types';
import { createChromeBackend } from './chromeBackend';
import { createDemoBackend } from './demoBackend';

export interface CreateInput {
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
}

export interface Backend {
  readonly kind: 'chrome' | 'demo';
  getTree(): Promise<BookmarkNode[]>;
  create(input: CreateInput): Promise<BookmarkNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<BookmarkNode>;
  move(id: string, dest: { parentId?: string; index?: number }): Promise<BookmarkNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
  search(query: string): Promise<BookmarkNode[]>;
  historySearch(query: string, days: number, max: number): Promise<HistoryItem[]>;
  openUrl(url: string, disposition: Disposition): Promise<void>;
  webSearch(text: string, disposition: 'current' | 'newTab'): Promise<void>;
  currentTab(): Promise<{ title: string; url: string } | null>;
  onChange(callback: () => void): () => void;
  onSettingsChanged(callback: () => void): () => void;
  hasHostPermission(): Promise<boolean>;
  requestHostPermission(): Promise<boolean>;
  removeHostPermission(): Promise<boolean>;
  openOptions(): Promise<void>;
  /** 请求 SW 打开（或复用）书签首页；demo 下直接 window.open */
  openHub(focusSearch: boolean): Promise<void>;
  storageGet<T>(key: string): Promise<T | undefined>;
  storageSet<T>(key: string, value: T): Promise<void>;
  storageRemove(key: string): Promise<void>;
}

let active: Backend | null = null;

export function getBackend(): Backend {
  if (!active) {
    const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
    active = chromeApi?.bookmarks ? createChromeBackend() : createDemoBackend();
  }
  return active;
}

export function setBackend(backend: Backend | null): void {
  active = backend;
}