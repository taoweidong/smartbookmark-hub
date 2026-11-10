import { getBackend } from '@/core/backend';
import { flattenTree } from '@/core/bookmarks';
import { APP_NAME } from '@/core/constants';
import { buildEntries, searchAll } from '@/core/search';
import { loadSettings } from '@/core/settings';
import type { SearchEntry } from '@/core/types';
import { parseSuggestionContent, toSuggestions } from './suggestions';

let cachedEntries: SearchEntry[] | null = null;
let cachedTagsKey = '';
// 书签事件递增：用于识别「索引构建期间书签已变化」的过期结果
let entriesGeneration = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestToken = 0;

async function getEntries(): Promise<SearchEntry[]> {
  const settings = await loadSettings();
  const tagsKey = JSON.stringify(settings.tags);
  const generationAtStart = entriesGeneration;
  if (cachedEntries && cachedTagsKey === tagsKey) return cachedEntries;
  const tree = await getBackend().getTree();
  const built = await buildEntries(flattenTree(tree), settings.tags);
  // 构建期间书签发生变化：结果只服务本次查询，不写入缓存（避免旧索引长期覆盖新数据）
  if (generationAtStart === entriesGeneration) {
    cachedEntries = built;
    cachedTagsKey = tagsKey;
  }
  return built;
}

async function openHub(focusSearch: boolean, query?: string): Promise<void> {
  const base = chrome.runtime.getURL('newtab.html');
  const hash = query ? `#q=${encodeURIComponent(query)}` : focusSearch ? '#search' : '';
  const target = `${base}${hash}`;
  // 始终新建标签页：复用已有首页标签会打断用户当前的操作现场
  await chrome.tabs.create({ url: target, active: true });
}

async function registerMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'sbh-search-selection',
    title: `用 ${APP_NAME} 搜索“%s”`,
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'sbh-save-page',
    title: '收藏当前页到书签栏',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'sbh-open-hub',
    title: `打开 ${APP_NAME} 首页`,
    contexts: ['action'],
  });
}

// 默认建议不随 SW 持久化：必须在每次 Service Worker 启动时（模块顶层）设置
chrome.omnibox.setDefaultSuggestion({
  description: `在 ${APP_NAME} 中搜索书签（优先）与历史 · 输入关键词开始`,
});

chrome.runtime.onInstalled.addListener(() => {
  void registerMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void registerMenus();
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const token = ++requestToken;
  debounceTimer = setTimeout(() => {
    void (async () => {
      const trimmed = text.trim();
      if (!trimmed) {
        suggest([]);
        return;
      }
      try {
        const settings = await loadSettings();
        const entries = await getEntries();
        const results = await searchAll(entries, trimmed, {
          includeHistory: settings.search.includeHistory,
          historyDays: settings.search.historyDays,
          limit: 8,
        });
        if (token === requestToken) suggest(toSuggestions(results));
      } catch {
        // 建议链路任一环节失败：回空建议，绝不让 omnibox 卡死或产生 unhandled rejection
        if (token === requestToken) suggest([]);
      }
    })();
  }, 120);
});

chrome.omnibox.onInputEntered.addListener((content) => {
  const parsed = parseSuggestionContent(content);
  if (parsed.kind === 'web' || parsed.kind === 'text') {
    const text = parsed.text.trim();
    // 自由文本回车走默认搜索引擎兜底，绝不把原始文本当 URL 打开
    if (text) void getBackend().webSearch(text).catch(() => {});
    return;
  }
  void getBackend().openUrl(parsed.url, 'newTab').catch(() => {});
});

chrome.omnibox.onInputCancelled.addListener(() => {
  requestToken += 1;
  if (debounceTimer) clearTimeout(debounceTimer);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-hub') void openHub(false);
  if (command === 'quick-search') void openHub(true);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sbh-search-selection' && info.selectionText) {
    void openHub(true, info.selectionText);
    return;
  }
  if (info.menuItemId === 'sbh-open-hub') {
    void openHub(false);
    return;
  }
  if (info.menuItemId === 'sbh-save-page' && tab?.url) {
    void (async () => {
      try {
        await getBackend().create({ parentId: '1', title: tab.title || tab.url!, url: tab.url });
        cachedEntries = null;
        await chrome.action.setBadgeText({ text: '＋' });
        await chrome.action.setBadgeBackgroundColor({ color: '#F2B33D' });
        setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 2500);
      } catch {
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });
        setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 2500);
      }
    })();
  }
});

for (const event of [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onChildrenReordered,
]) {
  event.addListener(() => {
    cachedEntries = null;
    entriesGeneration += 1;
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'sbh:open-hub') {
    void openHub(Boolean(message.focusSearch), message.query)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'sbh:invalidate') {
    cachedEntries = null;
    sendResponse({ ok: true });
    return false;
  }
  return false;
});