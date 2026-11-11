import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend, setBackend } from './backend';
import { createChromeBackend } from './chromeBackend';
import { SETTINGS_KEY } from './constants';
import type { Backend } from './backend';
import type { BookmarkNode } from './types';
import {
  createChromeApiMock,
  installChromeApiMock,
  stubTabsQuery,
  uninstallChromeApiMock,
  type ChromeApiMock,
} from '@/test/chromeApiMock';

const NODE: BookmarkNode = { id: 'b1', parentId: '1', title: '知乎', url: 'https://zhihu.com/' };

describe('chromeBackend 适配层', () => {
  let mock: ChromeApiMock;
  let backend: Backend;

  beforeEach(() => {
    mock = createChromeApiMock();
    installChromeApiMock(mock);
    backend = createChromeBackend();
  });

  afterEach(() => {
    uninstallChromeApiMock();
    setBackend(null);
  });

  it('isTabContext 依据当前文档所在标签页判定', async () => {
    await expect(backend.isTabContext()).resolves.toBe(false);
    mock.tabs.getCurrent.mockImplementation((cb) => cb({ id: 7 }));
    await expect(backend.isTabContext()).resolves.toBe(true);
  });

  describe('回调错误语义（runtime.lastError）', () => {
    it('getTree 在 lastError 存在时 reject 并携带错误信息', async () => {
      mock.bookmarks.getTree.mockImplementation((cb) => {
        mock.runtime.lastError = { message: '书签服务不可用' };
        cb([]);
        mock.runtime.lastError = undefined;
      });
      await expect(backend.getTree()).rejects.toThrow('书签服务不可用');
    });

    it('lastError 没有 message 时使用默认错误文案', async () => {
      mock.bookmarks.remove.mockImplementation((_id, cb) => {
        mock.runtime.lastError = {};
        cb();
        mock.runtime.lastError = undefined;
      });
      await expect(backend.remove('b1')).rejects.toThrow('Chrome API 调用失败');
    });

    it('create 失败时 reject 而不是吞掉错误', async () => {
      mock.bookmarks.create.mockImplementation((_input, cb) => {
        mock.runtime.lastError = { message: 'Index out of bounds.' };
        cb({ id: 'x', title: '' });
        mock.runtime.lastError = undefined;
      });
      await expect(backend.create({ title: 't', url: 'https://a.com/', index: 99 })).rejects.toThrow(
        'Index out of bounds.',
      );
    });

    it('openOptions 在 lastError 存在时 reject', async () => {
      mock.tabs.create.mockImplementation((_props, cb) => {
        mock.runtime.lastError = { message: '无法打开设置页' };
        cb?.({});
        mock.runtime.lastError = undefined;
        return undefined;
      });
      await expect(backend.openOptions()).rejects.toThrow('无法打开设置页');
    });
  });

  describe('书签 CRUD 参数透传', () => {
    it('getTree 返回回调给出的树', async () => {
      const tree: BookmarkNode[] = [{ id: '0', title: '', children: [NODE] }];
      mock.bookmarks.getTree.mockImplementation((cb) => cb(tree));
      await expect(backend.getTree()).resolves.toEqual(tree);
      expect(mock.bookmarks.getTree).toHaveBeenCalledTimes(1);
    });

    it('create 透传完整输入并返回新节点', async () => {
      mock.bookmarks.create.mockImplementation((_input, cb) => cb(NODE));
      const input = { parentId: '1', index: 2, title: '知乎', url: 'https://zhihu.com/' };
      await expect(backend.create(input)).resolves.toEqual(NODE);
      expect(mock.bookmarks.create).toHaveBeenCalledWith(input, expect.any(Function));
    });

    it('update 透传 id 与变更字段', async () => {
      const renamed = { ...NODE, title: '新标题' };
      mock.bookmarks.update.mockImplementation((_id, _changes, cb) => cb(renamed));
      await expect(backend.update('b1', { title: '新标题' })).resolves.toEqual(renamed);
      expect(mock.bookmarks.update).toHaveBeenCalledWith('b1', { title: '新标题' }, expect.any(Function));
    });

    it('move 透传目标文件夹与位置', async () => {
      mock.bookmarks.move.mockImplementation((_id, _dest, cb) => cb(NODE));
      await expect(backend.move('b1', { parentId: '2', index: 0 })).resolves.toEqual(NODE);
      expect(mock.bookmarks.move).toHaveBeenCalledWith('b1', { parentId: '2', index: 0 }, expect.any(Function));
    });

    it('remove 成功时 resolve 为 undefined', async () => {
      await expect(backend.remove('b1')).resolves.toBeUndefined();
      expect(mock.bookmarks.remove).toHaveBeenCalledWith('b1', expect.any(Function));
    });

    it('removeTree 透传 id 且不走 remove', async () => {
      await expect(backend.removeTree('folder-1')).resolves.toBeUndefined();
      expect(mock.bookmarks.removeTree).toHaveBeenCalledWith('folder-1', expect.any(Function));
      expect(mock.bookmarks.remove).not.toHaveBeenCalled();
    });

    it('search 透传查询词并返回结果数组', async () => {
      mock.bookmarks.search.mockImplementation((_query, cb) => cb([NODE]));
      await expect(backend.search('知乎')).resolves.toEqual([NODE]);
      expect(mock.bookmarks.search).toHaveBeenCalledWith('知乎', expect.any(Function));
    });
  });

  describe('historySearch', () => {
    it('过滤空 url 条目，并补全缺省标题与访问时间', async () => {
      mock.history.search.mockImplementation((_details, cb) =>
        cb([
          { title: '标题', url: 'https://a.com/', lastVisitTime: 123 },
          { title: '', url: 'https://b.com/' },
          { title: '没有 url 的条目' },
          { url: 'https://c.com/' },
        ]),
      );
      await expect(backend.historySearch('q', 30, 10)).resolves.toEqual([
        { title: '标题', url: 'https://a.com/', lastVisitTime: 123 },
        { title: 'https://b.com/', url: 'https://b.com/', lastVisitTime: 0 },
        { title: 'https://c.com/', url: 'https://c.com/', lastVisitTime: 0 },
      ]);
    });

    it('按天数换算 startTime 并透传 maxResults', async () => {
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      await backend.historySearch('关键词', 7, 20);
      expect(mock.history.search).toHaveBeenCalledWith(
        { text: '关键词', startTime: now - 7 * 86_400_000, maxResults: 20 },
        expect.any(Function),
      );
    });
  });

  describe('openUrl 只允许新标签页/新窗口', () => {
    it('newWindow 走 windows.create，不查询标签', async () => {
      await backend.openUrl('https://a.com/', 'newWindow');
      expect(mock.windows.create).toHaveBeenCalledWith({ url: 'https://a.com/' }, expect.any(Function));
      expect(mock.tabs.query).not.toHaveBeenCalled();
      expect(mock.tabs.create).not.toHaveBeenCalled();
    });

    it('newTab 走 tabs.create 并激活', async () => {
      await backend.openUrl('https://a.com/', 'newTab');
      expect(mock.tabs.create).toHaveBeenCalledWith({ url: 'https://a.com/', active: true }, expect.any(Function));
      expect(mock.tabs.update).not.toHaveBeenCalled();
    });

    it('不再更新当前标签：任何打开方式都不调用 tabs.update', async () => {
      stubTabsQuery(mock, [{ id: 11, url: 'https://old.com/', active: true }]);
      await backend.openUrl('https://a.com/', 'newTab');
      expect(mock.tabs.update).not.toHaveBeenCalled();
      expect(mock.tabs.query).not.toHaveBeenCalled();
    });
  });

  describe('webSearch 一律新标签页', () => {
    it('有 chrome.search 时映射为 NEW_TAB', async () => {
      await backend.webSearch('你好');
      expect(mock.search.query).toHaveBeenCalledWith({ text: '你好', disposition: 'NEW_TAB' });
      expect(mock.tabs.create).not.toHaveBeenCalled();
    });

    it('缺少 chrome.search 时回退 Google URL（newTab，含编码）', async () => {
      Reflect.deleteProperty(mock, 'search');
      await backend.webSearch('a&b c');
      expect(mock.tabs.create).toHaveBeenCalledWith(
        { url: `https://www.google.com/search?q=${encodeURIComponent('a&b c')}`, active: true },
        expect.any(Function),
      );
      expect(mock.tabs.update).not.toHaveBeenCalled();
    });
  });

  describe('currentTab', () => {
    it('返回活动标签的标题与 url', async () => {
      stubTabsQuery(mock, [{ id: 1, title: '页面标题', url: 'https://x.com/' }]);
      await expect(backend.currentTab()).resolves.toEqual({ title: '页面标题', url: 'https://x.com/' });
    });

    it('标题缺失时用 url 兜底', async () => {
      stubTabsQuery(mock, [{ id: 1, url: 'https://x.com/' }]);
      await expect(backend.currentTab()).resolves.toEqual({ title: 'https://x.com/', url: 'https://x.com/' });
    });

    it('没有活动标签或标签无 url 时返回 null', async () => {
      stubTabsQuery(mock, []);
      await expect(backend.currentTab()).resolves.toBeNull();
      stubTabsQuery(mock, [{ id: 1 }]);
      await expect(backend.currentTab()).resolves.toBeNull();
    });
  });

  describe('storage 与权限', () => {
    it('storageGet 按键取值，缺失时返回 undefined', async () => {
      mock.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { theme: 'light' } });
      await expect(backend.storageGet(SETTINGS_KEY)).resolves.toEqual({ theme: 'light' });
      await expect(backend.storageGet('missing')).resolves.toBeUndefined();
      expect(mock.storage.local.get).toHaveBeenCalledWith(SETTINGS_KEY);
    });

    it('storageSet / storageRemove 透传键值', async () => {
      await backend.storageSet('k', { a: 1 });
      expect(mock.storage.local.set).toHaveBeenCalledWith({ k: { a: 1 } });
      await backend.storageRemove('k');
      expect(mock.storage.local.remove).toHaveBeenCalledWith('k');
    });

    it('权限三件套都用 <all_urls> 并透传布尔结果', async () => {
      mock.permissions.contains.mockResolvedValue(false);
      mock.permissions.request.mockResolvedValue(true);
      mock.permissions.remove.mockResolvedValue(false);
      await expect(backend.hasHostPermission()).resolves.toBe(false);
      await expect(backend.requestHostPermission()).resolves.toBe(true);
      await expect(backend.removeHostPermission()).resolves.toBe(false);
      const origins = { origins: ['<all_urls>'] };
      expect(mock.permissions.contains).toHaveBeenCalledWith(origins);
      expect(mock.permissions.request).toHaveBeenCalledWith(origins);
      expect(mock.permissions.remove).toHaveBeenCalledWith(origins);
    });

    it('openOptions 新建标签页打开管理台，不复用已有标签', async () => {
      await expect(backend.openOptions()).resolves.toBeUndefined();
      expect(mock.tabs.create).toHaveBeenCalledWith(
        { url: 'chrome-extension://mock-extension-id/options.html', active: true },
        expect.any(Function),
      );
      expect(mock.runtime.openOptionsPage).not.toHaveBeenCalled();
    });
  });

  describe('事件订阅 wire()', () => {
    it('多次订阅只接线一次，且五类书签事件都会转发', () => {
      const first = vi.fn();
      const second = vi.fn();
      backend.onChange(first);
      backend.onChange(second);
      backend.onSettingsChanged(vi.fn());
      expect(mock.bookmarks.onCreated.addListener).toHaveBeenCalledTimes(1);
      expect(mock.bookmarks.onRemoved.addListener).toHaveBeenCalledTimes(1);
      expect(mock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);

      mock.bookmarks.onCreated.trigger('b1', NODE);
      mock.bookmarks.onRemoved.trigger('b1', {});
      mock.bookmarks.onChanged.trigger('b1', {});
      mock.bookmarks.onMoved.trigger('b1', {});
      mock.bookmarks.onChildrenReordered.trigger('1', {});
      expect(first).toHaveBeenCalledTimes(5);
      expect(second).toHaveBeenCalledTimes(5);
    });

    it('退订后不再收到书签变更回调', () => {
      const kept = vi.fn();
      const removed = vi.fn();
      const unsubscribe = backend.onChange(removed);
      backend.onChange(kept);
      mock.bookmarks.onCreated.trigger('b1', NODE);
      unsubscribe();
      mock.bookmarks.onCreated.trigger('b2', NODE);
      expect(removed).toHaveBeenCalledTimes(1);
      expect(kept).toHaveBeenCalledTimes(2);
    });

    it('设置订阅只响应 local 区域的 SETTINGS_KEY 变化', () => {
      const onChange = vi.fn();
      backend.onSettingsChanged(onChange);
      mock.storage.onChanged.trigger({ [SETTINGS_KEY]: {} }, 'sync');
      mock.storage.onChanged.trigger({ other: {} }, 'local');
      expect(onChange).not.toHaveBeenCalled();
      mock.storage.onChanged.trigger({ [SETTINGS_KEY]: {} }, 'local');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('设置订阅退订后不再回调', () => {
      const onChange = vi.fn();
      const unsubscribe = backend.onSettingsChanged(onChange);
      unsubscribe();
      mock.storage.onChanged.trigger({ [SETTINGS_KEY]: {} }, 'local');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('getBackend 选择逻辑', () => {
    it('存在 chrome.bookmarks 时选择 chrome 后端', () => {
      setBackend(null);
      expect(getBackend().kind).toBe('chrome');
    });

    it('缺少 chrome API 时回退 demo 后端', () => {
      uninstallChromeApiMock();
      setBackend(null);
      expect(getBackend().kind).toBe('demo');
    });
  });
});