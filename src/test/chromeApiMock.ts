import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BookmarkNode } from '@/core/types';

// 与 chromeMock.ts（Backend 接口的假实现）不同，这里桩的是 chrome.* API 本身：
// - 回调式 API 默认同步调用回调，可用 mockImplementation 换成延迟/失败语义
// - 双模 API（tabs/windows）同时支持回调与 Promise 两种调用形态
// - 事件对象记录 addListener 注册的回调，测试用 trigger 手动触发

export interface MockTab {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
  active?: boolean;
}

export interface MockHistoryItem {
  title?: string;
  url?: string;
  lastVisitTime?: number;
}

export interface MockEvent<TArgs extends unknown[] = unknown[], TReturn = void> {
  listeners: ((...args: TArgs) => TReturn)[];
  addListener: Mock<(callback: (...args: TArgs) => TReturn) => void>;
  removeListener: Mock<(callback: (...args: TArgs) => TReturn) => void>;
  hasListener: Mock<(callback: (...args: TArgs) => TReturn) => boolean>;
  trigger: (...args: TArgs) => void;
}

export function createMockEvent<TArgs extends unknown[] = unknown[], TReturn = void>(): MockEvent<
  TArgs,
  TReturn
> {
  const listeners: ((...args: TArgs) => TReturn)[] = [];
  return {
    listeners,
    addListener: vi.fn((callback: (...args: TArgs) => TReturn) => {
      listeners.push(callback);
    }),
    removeListener: vi.fn((callback: (...args: TArgs) => TReturn) => {
      const at = listeners.indexOf(callback);
      if (at >= 0) listeners.splice(at, 1);
    }),
    hasListener: vi.fn((callback: (...args: TArgs) => TReturn) => listeners.includes(callback)),
    trigger: (...args: TArgs) => {
      for (const callback of [...listeners]) callback(...args);
    },
  };
}

/** 回调式 API：最后一个参数是回调，默认同步以 initial() 的结果调用它 */
function callbackApi<TArgs extends unknown[], TResult>(initial: () => TResult) {
  return vi.fn((...args: [...TArgs, callback: (value: TResult) => void]) => {
    const callback = args[args.length - 1] as (value: TResult) => void;
    callback(initial());
  });
}

/** 双模 API：带回调走回调，不带回调返回 Promise（MV3 两种形态都合法） */
function dualApi<TArgs extends unknown[], TResult>(initial: () => TResult) {
  return vi.fn((...args: [...TArgs, callback?: (value: TResult) => void]) => {
    const last = args[args.length - 1];
    const value = initial();
    if (typeof last === 'function') {
      (last as (value: TResult) => void)(value);
      return undefined;
    }
    return Promise.resolve(value);
  });
}

export interface BookmarkCreateInput {
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
}

export function createChromeApiMock() {
  return {
    runtime: {
      id: 'mock-extension-id',
      lastError: undefined as { message?: string } | undefined,
      getURL: vi.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),
      sendMessage: vi.fn(async (_message: unknown) => ({})),
      openOptionsPage: callbackApi<[], void>(() => undefined),
      onMessage: createMockEvent<
        [message: unknown, sender: unknown, sendResponse: (response?: unknown) => void],
        boolean | undefined
      >(),
      onInstalled: createMockEvent(),
      onStartup: createMockEvent(),
    },
    bookmarks: {
      getTree: callbackApi<[], BookmarkNode[]>(() => []),
      create: callbackApi<[input: BookmarkCreateInput], BookmarkNode>(() => ({
        id: 'created',
        title: '',
      })),
      update: callbackApi<[id: string, changes: { title?: string; url?: string }], BookmarkNode>(
        () => ({ id: 'updated', title: '' }),
      ),
      move: callbackApi<[id: string, dest: { parentId?: string; index?: number }], BookmarkNode>(
        () => ({ id: 'moved', title: '' }),
      ),
      remove: callbackApi<[id: string], void>(() => undefined),
      removeTree: callbackApi<[id: string], void>(() => undefined),
      search: callbackApi<[query: string], BookmarkNode[]>(() => []),
      onCreated: createMockEvent(),
      onRemoved: createMockEvent(),
      onChanged: createMockEvent(),
      onMoved: createMockEvent(),
      onChildrenReordered: createMockEvent(),
    },
    history: {
      search: callbackApi<
        [details: { text: string; startTime: number; maxResults: number }],
        MockHistoryItem[]
      >(() => []),
    },
    tabs: {
      query: dualApi<[queryInfo: Record<string, unknown>], MockTab[]>(() => []),
      create: dualApi<[props: { url?: string; active?: boolean }], MockTab>(() => ({})),
      update: dualApi<[tabId: number, props: { url?: string; active?: boolean }], MockTab>(
        () => ({}),
      ),
    },
    windows: {
      create: dualApi<[props: { url?: string }], { id?: number }>(() => ({})),
      update: dualApi<[windowId: number, props: { focused?: boolean }], { id?: number }>(() => ({})),
    },
    storage: {
      local: {
        get: vi.fn(async (_key: string): Promise<Record<string, unknown>> => ({})),
        set: vi.fn(async (_items: Record<string, unknown>) => {}),
        remove: vi.fn(async (_key: string) => {}),
      },
      onChanged: createMockEvent<[changes: Record<string, unknown>, area: string]>(),
    },
    omnibox: {
      setDefaultSuggestion: vi.fn((_suggestion: { description: string }) => {}),
      onInputChanged: createMockEvent<
        [text: string, suggest: (suggestions: { content: string; description: string }[]) => void]
      >(),
      onInputEntered: createMockEvent<[content: string, disposition: string]>(),
      onInputCancelled: createMockEvent<[]>(),
    },
    contextMenus: {
      removeAll: vi.fn(async () => {}),
      create: vi.fn((_props: { id: string; title: string; contexts: string[] }) => {}),
      onClicked: createMockEvent<
        [info: { menuItemId: string; selectionText?: string }, tab?: MockTab]
      >(),
    },
    action: {
      setBadgeText: vi.fn(async (_details: { text: string }) => {}),
      setBadgeBackgroundColor: vi.fn(async (_details: { color: string }) => {}),
    },
    commands: {
      onCommand: createMockEvent<[command: string]>(),
    },
    permissions: {
      contains: vi.fn(async (_details: { origins: string[] }) => true),
      request: vi.fn(async (_details: { origins: string[] }) => true),
      remove: vi.fn(async (_details: { origins: string[] }) => true),
    },
    search: {
      query: vi.fn(async (_info: { text: string; disposition: string }) => {}),
    },
  };
}

export type ChromeApiMock = ReturnType<typeof createChromeApiMock>;

export function installChromeApiMock(mock: ChromeApiMock): void {
  (globalThis as unknown as { chrome?: unknown }).chrome = mock;
}

export function uninstallChromeApiMock(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

/** 让 tabs.query 在回调与 Promise 两种形态下都返回同一份标签列表 */
export function stubTabsQuery(mock: ChromeApiMock, tabs: MockTab[]): void {
  mock.tabs.query.mockImplementation((_queryInfo, callback) => {
    if (callback) {
      callback(tabs);
      return undefined;
    }
    return Promise.resolve(tabs);
  });
}