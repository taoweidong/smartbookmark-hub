export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
}

export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  parentId: string;
  folderPath: string[];
  dateAdded: number;
}

export interface SearchEntry extends FlatBookmark {
  host: string;
  canonicalUrl: string;
  titleLower: string;
  urlLower: string;
  initials: string;
  pinyinFull: string;
  tags: string[];
  /** 预计算的小写字段，避免查询时反复分配 */
  folderLower: string;
  tagLowers: string[];
}

export type ResultKind = 'bookmark' | 'history' | 'web';

export interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  url: string;
  subtitle: string;
  score: number;
  matchedOn: string;
  /** kind === 'web' 时携带原始查询词，避免 UI 层从标题文案反解 */
  query?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentName = 'gilt' | 'azure' | 'verdant' | 'magenta';

export interface DashboardTab {
  id: string;
  name: string;
  folderIds: string[];
}

export interface Settings {
  /** 结构版本：设置迁移与兼容性判断依据 */
  version: number;
  theme: ThemeMode;
  accent: AccentName;
  dashboard: {
    tabs: DashboardTab[];
    activeTabId: string;
    layout: 'grid' | 'list';
    cardSize: 'sm' | 'md' | 'lg';
    sort: 'default' | 'recent' | 'title' | 'host';
    perFolder: number;
    showStats: boolean;
    viewBarOpen: boolean;
    seeded: boolean;
    background: { type: 'aurora' | 'solid' | 'image'; value: string; revision?: number };
  };
  search: {
    includeHistory: boolean;
    historyDays: number;
    maxResults: number;
    debounceMs: number;
  };
  scan: {
    concurrency: number;
    timeoutMs: number;
    hostDelayMs: number;
    cacheDays: number;
    ignoreWww: boolean;
    titleThreshold: number;
  };
  tags: Record<string, string[]>;
  recentQueries: string[];
}

export type LinkStatus = 'ok' | 'dead' | 'blocked' | 'error' | 'timeout' | 'skipped';

export interface LinkHealth {
  canonicalUrl: string;
  status: LinkStatus;
  httpStatus?: number;
  finalUrl?: string;
  checkedAt: number;
  message?: string;
}

export interface DuplicateGroup {
  key: string;
  reason: 'url' | 'title';
  items: FlatBookmark[];
  keepId: string;
  similarity: number;
}

export interface DeadLinkItem {
  bookmark: FlatBookmark;
  health: LinkHealth;
}

export interface EmptyFolderRef {
  id: string;
  title: string;
  path: string[];
}

export interface ScanReport {
  id: string;
  startedAt: number;
  finishedAt?: number;
  total: number;
  checked: number;
  deadLinks: DeadLinkItem[];
  blocked: DeadLinkItem[];
  errors: DeadLinkItem[];
  duplicates: DuplicateGroup[];
  emptyFolders: EmptyFolderRef[];
  cursor: number;
  cancelled: boolean;
  /** 已检测（含 ok）的书签 id：续扫据此跳过，checked 单调不回退（v2 R4.4） */
  checkedIds?: string[];
}

export interface TrashNode {
  id: string;
  title: string;
  url?: string;
  parentId: string;
  parentTitles: string[];
  index: number;
  dateAdded?: number;
  children?: TrashNode[];
}

export interface TrashBatch {
  id: string;
  deletedAt: number;
  label: string;
  nodes: TrashNode[];
}

export interface HistoryItem {
  title: string;
  url: string;
  lastVisitTime: number;
}

/** 打开方式：插件不再原地覆盖当前标签页，只允许新标签页/新窗口 */
export type Disposition = 'newTab' | 'newWindow';

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
  undo?: () => void;
  createdAt: number;
}