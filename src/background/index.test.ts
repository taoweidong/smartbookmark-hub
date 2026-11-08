import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME } from '@/core/constants';
import type { BookmarkNode } from '@/core/types';
import {
  createChromeApiMock,
  installChromeApiMock,
  stubTabsQuery,
  uninstallChromeApiMock,
  type ChromeApiMock,
} from '@/test/chromeApiMock';
import { WEB_PREFIX } from './suggestions';

const BASE_URL = 'chrome-extension://mock-extension-id/newtab.html';

const TREE: BookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        children: [
          {
            id: 'b1',
            parentId: '1',
            title: '知乎问题',
            url: 'https://www.zhihu.com/q/1',
            dateAdded: 0,
          },
        ],
      },
    ],
  },
];

describe('background service worker', () => {
  let mock: ChromeApiMock;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createChromeApiMock();
    installChromeApiMock(mock);
    mock.bookmarks.getTree.mockImplementation((cb) => cb(structuredClone(TREE)));
    // 模块顶层即注册监听器：必须先装桩、重置模块注册表，再动态导入
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    uninstallChromeApiMock();
    vi.resetModules();
  });

  async function loadBackground(): Promise<void> {
    await import('./index');
  }

  /** 排空异步链条（openHub / 徽标 / 搜索都是纯 microtask + 已 fake 的定时器） */
  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(0);
  }

  /** 触发一次 omnibox 搜索并等防抖结束，返回 suggest  spy */
  async function searchOnce(text: string) {
    const suggest = vi.fn();
    mock.omnibox.onInputChanged.trigger(text, suggest);
    await vi.advanceTimersByTimeAsync(120);
    await flush();
    return suggest;
  }

  it('模块加载即设置 omnibox 默认建议', async () => {
    await loadBackground();
    expect(mock.omnibox.setDefaultSuggestion).toHaveBeenCalledTimes(1);
    expect(mock.omnibox.setDefaultSuggestion.mock.calls[0][0].description).toContain(APP_NAME);
  });

  it('onInstalled 与 onStartup 都会重建三个右键菜单', async () => {
    await loadBackground();
    mock.runtime.onInstalled.trigger();
    await flush();
    expect(mock.contextMenus.removeAll).toHaveBeenCalledTimes(1);
    expect(mock.contextMenus.create.mock.calls.map((call) => call[0].id)).toEqual([
      'sbh-search-selection',
      'sbh-save-page',
      'sbh-open-hub',
    ]);
    mock.runtime.onStartup.trigger();
    await flush();
    expect(mock.contextMenus.removeAll).toHaveBeenCalledTimes(2);
    expect(mock.contextMenus.create).toHaveBeenCalledTimes(6);
  });

  describe('omnibox 输入', () => {
    it('防抖 120ms 后才给出建议，书签在前网页兜底在后', async () => {
      await loadBackground();
      const suggest = vi.fn();
      mock.omnibox.onInputChanged.trigger('知乎', suggest);
      await vi.advanceTimersByTimeAsync(119);
      expect(suggest).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(suggest).toHaveBeenCalledTimes(1);
      const items = suggest.mock.calls[0][0] as { content: string }[];
      expect(items[0].content).toBe('https://www.zhihu.com/q/1');
      expect(items[items.length - 1].content).toBe(`${WEB_PREFIX}知乎`);
    });

    it('连续输入只保留最后一次防抖结果', async () => {
      await loadBackground();
      const first = vi.fn();
      const second = vi.fn();
      mock.omnibox.onInputChanged.trigger('知', first);
      await vi.advanceTimersByTimeAsync(60);
      mock.omnibox.onInputChanged.trigger('知乎', second);
      await vi.advanceTimersByTimeAsync(120);
      await flush();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('后发请求先返回时，过期请求的结果被丢弃（token 竞态）', async () => {
      await loadBackground();
      let releaseFirst: ((nodes: BookmarkNode[]) => void) | undefined;
      let calls = 0;
      mock.bookmarks.getTree.mockImplementation((cb) => {
        calls += 1;
        if (calls === 1) releaseFirst = cb;
        else cb(structuredClone(TREE));
      });
      const stale = vi.fn();
      const fresh = vi.fn();
      mock.omnibox.onInputChanged.trigger('知乎', stale);
      await vi.advanceTimersByTimeAsync(120);
      await flush();
      expect(calls).toBe(1);
      mock.omnibox.onInputChanged.trigger('知乎', fresh);
      await vi.advanceTimersByTimeAsync(120);
      await flush();
      expect(fresh).toHaveBeenCalledTimes(1);
      releaseFirst?.(structuredClone(TREE));
      await flush();
      expect(stale).not.toHaveBeenCalled();
    });

    it('空白输入直接 suggest([]) 且不查询书签树', async () => {
      await loadBackground();
      const suggest = vi.fn();
      mock.omnibox.onInputChanged.trigger('   ', suggest);
      await vi.advanceTimersByTimeAsync(120);
      await flush();
      expect(suggest).toHaveBeenCalledWith([]);
      expect(mock.bookmarks.getTree).not.toHaveBeenCalled();
    });

    it('onInputCancelled 清掉尚未触发的防抖定时器', async () => {
      await loadBackground();
      const suggest = vi.fn();
      mock.omnibox.onInputChanged.trigger('知乎', suggest);
      mock.omnibox.onInputCancelled.trigger();
      await vi.advanceTimersByTimeAsync(500);
      await flush();
      expect(suggest).not.toHaveBeenCalled();
      expect(mock.bookmarks.getTree).not.toHaveBeenCalled();
    });
  });

  describe('onInputEntered', () => {
    it('URL 建议 + currentTab 更新当前活动标签', async () => {
      await loadBackground();
      stubTabsQuery(mock, [{ id: 5, url: 'https://old.com/', active: true }]);
      mock.omnibox.onInputEntered.trigger('https://www.zhihu.com/q/1', 'currentTab');
      await flush();
      expect(mock.tabs.update.mock.calls[0].slice(0, 2)).toEqual([5, { url: 'https://www.zhihu.com/q/1' }]);
      expect(mock.search.query).not.toHaveBeenCalled();
    });

    it('自由文本 + newForegroundTab 走默认搜索引擎 NEW_TAB', async () => {
      await loadBackground();
      mock.omnibox.onInputEntered.trigger('随便搜点啥', 'newForegroundTab');
      await flush();
      expect(mock.search.query).toHaveBeenCalledWith({ text: '随便搜点啥', disposition: 'NEW_TAB' });
      expect(mock.tabs.update).not.toHaveBeenCalled();
    });

    it('web 前缀建议 + currentTab 还原查询词走 CURRENT_TAB', async () => {
      await loadBackground();
      mock.omnibox.onInputEntered.trigger(`${WEB_PREFIX}关键词`, 'currentTab');
      await flush();
      expect(mock.search.query).toHaveBeenCalledWith({ text: '关键词', disposition: 'CURRENT_TAB' });
    });
  });

  describe('openHub（commands 与右键菜单）', () => {
    it('open-hub 命令复用已有首页标签并聚焦窗口', async () => {
      await loadBackground();
      stubTabsQuery(mock, [{ id: 9, windowId: 4, url: `${BASE_URL}#old` }]);
      mock.commands.onCommand.trigger('open-hub');
      await flush();
      expect(mock.tabs.update).toHaveBeenCalledWith(9, { url: BASE_URL, active: true });
      expect(mock.windows.update).toHaveBeenCalledWith(4, { focused: true });
      expect(mock.tabs.create).not.toHaveBeenCalled();
    });

    it('quick-search 命令无已有标签时新建带 #search 的标签', async () => {
      await loadBackground();
      mock.commands.onCommand.trigger('quick-search');
      await flush();
      expect(mock.tabs.create).toHaveBeenCalledWith({ url: `${BASE_URL}#search` });
      expect(mock.tabs.update).not.toHaveBeenCalled();
    });

    it('右键搜索选中文字携带编码后的 #q= 查询', async () => {
      await loadBackground();
      mock.contextMenus.onClicked.trigger(
        { menuItemId: 'sbh-search-selection', selectionText: 'a b&c' },
        undefined,
      );
      await flush();
      expect(mock.tabs.create).toHaveBeenCalledWith({ url: `${BASE_URL}#q=a%20b%26c` });
    });

    it('右键打开首页不带 hash', async () => {
      await loadBackground();
      mock.contextMenus.onClicked.trigger({ menuItemId: 'sbh-open-hub' }, undefined);
      await flush();
      expect(mock.tabs.create).toHaveBeenCalledWith({ url: BASE_URL });
    });
  });

  describe('右键收藏当前页', () => {
    it('收藏成功显示「＋」徽标并在 2.5 秒后清除', async () => {
      await loadBackground();
      mock.contextMenus.onClicked.trigger(
        { menuItemId: 'sbh-save-page' },
        { url: 'https://x.dev/', title: 'X 站' },
      );
      await flush();
      expect(mock.bookmarks.create).toHaveBeenCalledWith(
        { parentId: '1', title: 'X 站', url: 'https://x.dev/' },
        expect.any(Function),
      );
      expect(mock.action.setBadgeText).toHaveBeenCalledWith({ text: '＋' });
      expect(mock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F2B33D' });
      await vi.advanceTimersByTimeAsync(2500);
      expect(mock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    it('页面标题缺失时用 url 兜底作为书签标题', async () => {
      await loadBackground();
      mock.contextMenus.onClicked.trigger({ menuItemId: 'sbh-save-page' }, { url: 'https://x.dev/' });
      await flush();
      expect(mock.bookmarks.create).toHaveBeenCalledWith(
        { parentId: '1', title: 'https://x.dev/', url: 'https://x.dev/' },
        expect.any(Function),
      );
    });

    it('create 失败显示「!」徽标并按时清除', async () => {
      await loadBackground();
      mock.bookmarks.create.mockImplementation((_input, cb) => {
        mock.runtime.lastError = { message: '书签栏不可写' };
        cb({ id: 'x', title: '' });
        mock.runtime.lastError = undefined;
      });
      mock.contextMenus.onClicked.trigger(
        { menuItemId: 'sbh-save-page' },
        { url: 'https://x.dev/', title: 'X 站' },
      );
      await flush();
      expect(mock.action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
      expect(mock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF6B6B' });
      await vi.advanceTimersByTimeAsync(2500);
      expect(mock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    it('没有 tab url 时不收藏也不设徽标', async () => {
      await loadBackground();
      mock.contextMenus.onClicked.trigger({ menuItemId: 'sbh-save-page' }, undefined);
      await flush();
      expect(mock.bookmarks.create).not.toHaveBeenCalled();
      expect(mock.action.setBadgeText).not.toHaveBeenCalled();
    });
  });

  describe('runtime.onMessage', () => {
    it('sbh:invalidate 清空缓存并同步 sendResponse', async () => {
      await loadBackground();
      await searchOnce('知乎');
      await searchOnce('知乎');
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(1); // 第二次命中缓存
      const listener = mock.runtime.onMessage.listeners[0];
      const sendResponse = vi.fn();
      const keepAlive = listener({ type: 'sbh:invalidate' }, {}, sendResponse);
      expect(keepAlive).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      await searchOnce('知乎');
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(2); // 缓存已失效
    });

    it('sbh:open-hub 成功后异步应答 ok:true', async () => {
      await loadBackground();
      const listener = mock.runtime.onMessage.listeners[0];
      const sendResponse = vi.fn();
      const keepAlive = listener(
        { type: 'sbh:open-hub', focusSearch: true, query: '你好' },
        {},
        sendResponse,
      );
      expect(keepAlive).toBe(true);
      expect(sendResponse).not.toHaveBeenCalled();
      await flush();
      expect(mock.tabs.create).toHaveBeenCalledWith({ url: `${BASE_URL}#q=${encodeURIComponent('你好')}` });
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    it('sbh:open-hub 失败也应答 ok:false', async () => {
      await loadBackground();
      mock.tabs.query.mockImplementation(() => Promise.reject(new Error('tabs 不可用')));
      const listener = mock.runtime.onMessage.listeners[0];
      const sendResponse = vi.fn();
      expect(listener({ type: 'sbh:open-hub' }, {}, sendResponse)).toBe(true);
      await flush();
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });

    it('未知消息与空消息返回 false 且不应答', async () => {
      await loadBackground();
      const listener = mock.runtime.onMessage.listeners[0];
      const sendResponse = vi.fn();
      expect(listener({ type: 'other' }, {}, sendResponse)).toBe(false);
      expect(listener(null, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('书签事件使缓存失效', () => {
    it('onCreated 触发后下一次搜索重新拉取书签树', async () => {
      await loadBackground();
      await searchOnce('知乎');
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(1);
      mock.bookmarks.onCreated.trigger('b2', { id: 'b2', title: '新书签' });
      await searchOnce('知乎');
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(2);
    });

    it('onRemoved/onChanged/onMoved/onChildrenReordered 同样清缓存', async () => {
      await loadBackground();
      await searchOnce('知乎');
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(1);
      const events = [
        mock.bookmarks.onRemoved,
        mock.bookmarks.onChanged,
        mock.bookmarks.onMoved,
        mock.bookmarks.onChildrenReordered,
      ];
      for (let i = 0; i < events.length; i += 1) {
        events[i].trigger('b1', {});
        await searchOnce('知乎');
        expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(i + 2);
      }
    });
  });

describe('omnibox 健壮性与缓存代次（v2 R4.2）', () => {
  const NEW_TREE: BookmarkNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [
            { id: 'b2', parentId: '1', title: '新站文章', url: 'https://new.example.com/post', dateAdded: 1 },
          ],
        },
      ],
    },
  ];

  it('建议链路异常时仍返回空建议，不产生 unhandled rejection', async () => {
    await loadBackground();
    mock.storage.local.get.mockRejectedValueOnce(new Error('存储故障'));
    const suggest = await searchOnce('知乎问题');
    expect(suggest).toHaveBeenCalledWith([]);
  });

  it('onInputEntered 打开失败时静默降级，不产生 unhandled rejection', async () => {
    await loadBackground();
    mock.tabs.query.mockImplementation(() => Promise.reject(new Error('tabs 故障')));
    expect(() =>
      mock.omnibox.onInputEntered.trigger('https://www.zhihu.com/q/1', 'currentTab'),
    ).not.toThrow();
    await flush();
  });

  it('构建期间书签变化，过期结果不写入缓存', async () => {
    await loadBackground();

    // getTree 挂起：让「读取 → 构建索引」横跨一次书签事件
    let releaseTree!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseTree = resolve;
    });
    mock.bookmarks.getTree.mockImplementation((cb: (tree: BookmarkNode[]) => void) => {
      void gate.then(() => cb(structuredClone(TREE)));
    });

    const suggest = vi.fn();
    mock.omnibox.onInputChanged.trigger('知乎问题', suggest);
    await vi.advanceTimersByTimeAsync(120); // 防抖结束，构建开始并挂在 getTree 上

    mock.bookmarks.onCreated.trigger('changed'); // 构建期间书签变化：作废缓存 + 代次 +1
    releaseTree(); // 以事件前的旧树完成构建
    await flush();

    // 若实现把「事件前的旧树」构建结果写入了缓存，这里会沿用旧索引而非重建
    mock.bookmarks.getTree.mockImplementation((cb: (tree: BookmarkNode[]) => void) =>
      cb(structuredClone(NEW_TREE)),
    );
    const second = await searchOnce('新站文章');
    const contents = (second.mock.calls[0]?.[0] as { content: string }[]).map((item) => item.content);
    expect(contents).toContain('https://new.example.com/post');
  });
});
});
