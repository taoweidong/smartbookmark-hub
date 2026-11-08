import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY, SPECIAL_FOLDER_IDS } from './constants';
import { createDemoBackend, demoOpened } from './demoBackend';
import { createFixtureTree } from './fixtures';
import type { BookmarkNode } from './types';

/** emit 走 queueMicrotask；排在其后入队即可保证监听器已执行 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function miniSeed(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: '书签栏',
          children: [
            { id: 'a', parentId: '1', title: '甲站', url: 'https://a.example.com/', index: 0 },
            {
              id: 'f',
              parentId: '1',
              title: '文件夹',
              index: 1,
              children: [{ id: 'b', parentId: 'f', title: '乙站', url: 'https://b.example.com/', index: 0 }],
            },
          ],
        },
        { id: '2', parentId: '0', title: '其他书签', children: [] },
        { id: '3', parentId: '0', title: '移动版书签', children: [] },
      ],
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createDemoBackend 基础契约', () => {
  it('默认使用夹具树，kind 为 demo', async () => {
    const backend = createDemoBackend();
    expect(backend.kind).toBe('demo');
    const tree = await backend.getTree();
    expect(tree).toEqual(createFixtureTree());
    expect(tree[0].id).toBe('0');
    expect(tree[0].children?.map((node) => node.id)).toEqual(['1', '2', '3']);
  });

  it('接受自定义种子树', async () => {
    const backend = createDemoBackend(miniSeed());
    expect(await backend.getTree()).toEqual(miniSeed());
  });

  it('getTree 返回结构化克隆：修改返回值不污染内部树', async () => {
    const backend = createDemoBackend(miniSeed());
    const first = await backend.getTree();
    first[0].children![0].children![0].title = '被篡改';
    first[0].children!.pop();
    const second = await backend.getTree();
    expect(second).toEqual(miniSeed());
    expect(first).not.toBe(second);
  });

  it('currentTab 返回演示占位页面', async () => {
    const tab = await createDemoBackend().currentTab();
    expect(tab?.url).toBe('https://developer.chrome.com/docs/extensions');
    expect(tab?.title).toContain('演示模式');
  });

  it('演示模式下主机权限恒为已授予', async () => {
    const backend = createDemoBackend();
    expect(await backend.hasHostPermission()).toBe(true);
    expect(await backend.requestHostPermission()).toBe(true);
    expect(await backend.removeHostPermission()).toBe(true);
  });
});

describe('create', () => {
  it('默认挂到书签栏末尾并补齐元数据', async () => {
    const backend = createDemoBackend(miniSeed());
    const node = await backend.create({ title: '新页', url: 'https://new.example.com/' });
    expect(node.parentId).toBe('1');
    expect(node.index).toBe(2);
    expect(node.id).toBe('9001');
    expect(node.dateAdded).toBeGreaterThan(0);
    const bar = (await backend.getTree())[0].children![0];
    expect(bar.children?.map((child) => child.id)).toEqual(['a', 'f', node.id]);
    expect(bar.dateGroupModified).toBeGreaterThan(0);
  });

  it('返回值是克隆：修改不影响内部树', async () => {
    const backend = createDemoBackend(miniSeed());
    const node = await backend.create({ title: '原样', url: 'https://keep.example.com/' });
    node.title = '篡改';
    const found = (await backend.getTree())[0].children![0].children!.find((child) => child.id === node.id);
    expect(found?.title).toBe('原样');
  });

  it('指定 index 插入并重排兄弟节点', async () => {
    const backend = createDemoBackend(miniSeed());
    const node = await backend.create({ parentId: '1', index: 0, title: '插队', url: 'https://first.example.com/' });
    const bar = (await backend.getTree())[0].children![0];
    expect(bar.children?.map((child) => child.id)).toEqual([node.id, 'a', 'f']);
    expect(bar.children?.map((child) => child.index)).toEqual([0, 1, 2]);
  });

  it('越界 index 被夹取到合法范围', async () => {
    const backend = createDemoBackend(miniSeed());
    const head = await backend.create({ parentId: '1', index: -5, title: '负索引', url: 'https://neg.example.com/' });
    expect(head.index).toBe(0);
    const tail = await backend.create({ parentId: '1', index: 999, title: '超尾', url: 'https://tail.example.com/' });
    expect(tail.index).toBe(3);
  });

  it('在新建文件夹下继续创建时自动初始化 children', async () => {
    const backend = createDemoBackend(miniSeed());
    const folder = await backend.create({ parentId: '1', title: '新文件夹' });
    expect(folder.url).toBeUndefined();
    const child = await backend.create({ parentId: folder.id, title: '子页', url: 'https://child.example.com/' });
    expect(child.parentId).toBe(folder.id);
    const tree = await backend.getTree();
    const created = tree[0].children![0].children!.find((node) => node.id === folder.id);
    expect(created?.children?.[0].id).toBe(child.id);
  });

  it('父文件夹不存在时 reject', async () => {
    const backend = createDemoBackend(miniSeed());
    await expect(backend.create({ parentId: 'nope', title: '孤儿' })).rejects.toThrow('父文件夹 nope 不存在');
  });
});

describe('update', () => {
  it('按需更新标题与 URL 并返回克隆', async () => {
    const backend = createDemoBackend(miniSeed());
    const updated = await backend.update('a', { title: '改名', url: 'https://renamed.example.com/' });
    expect(updated.title).toBe('改名');
    expect(updated.url).toBe('https://renamed.example.com/');
    updated.title = '篡改';
    const tree = await backend.getTree();
    expect(tree[0].children![0].children![0].title).toBe('改名');
  });

  it('只传标题时 URL 保持不变', async () => {
    const backend = createDemoBackend(miniSeed());
    const updated = await backend.update('a', { title: '仅改名' });
    expect(updated.url).toBe('https://a.example.com/');
  });

  it('节点不存在时 reject', async () => {
    await expect(createDemoBackend(miniSeed()).update('ghost', { title: 'x' })).rejects.toThrow('找不到书签节点 ghost');
  });
});

describe('move', () => {
  it('移动到目标文件夹指定位置并重排索引', async () => {
    const backend = createDemoBackend(miniSeed());
    const moved = await backend.move('a', { parentId: 'f', index: 0 });
    expect(moved.parentId).toBe('f');
    expect(moved.index).toBe(0);
    const tree = await backend.getTree();
    const bar = tree[0].children![0];
    expect(bar.children?.map((node) => node.id)).toEqual(['f']);
    const folder = bar.children![0];
    expect(folder.children?.map((node) => node.id)).toEqual(['a', 'b']);
    expect(folder.children?.map((node) => node.index)).toEqual([0, 1]);
  });

  it('省略 parentId 时留在原文件夹，仅调整位置', async () => {
    const backend = createDemoBackend(miniSeed());
    const moved = await backend.move('a', { index: 1 });
    expect(moved.parentId).toBe('1');
    const bar = (await backend.getTree())[0].children![0];
    expect(bar.children?.map((node) => node.id)).toEqual(['f', 'a']);
  });

  it('越界 index 被夹取到末尾', async () => {
    const backend = createDemoBackend(miniSeed());
    const moved = await backend.move('a', { parentId: 'f', index: 99 });
    expect(moved.index).toBe(1);
  });

  it('节点不存在时 reject', async () => {
    await expect(createDemoBackend(miniSeed()).move('ghost', { parentId: '1' })).rejects.toThrow('找不到书签节点 ghost');
  });

  it('目标文件夹不存在时 reject 且树不变', async () => {
    const backend = createDemoBackend(miniSeed());
    const before = await backend.getTree();
    await expect(backend.move('a', { parentId: 'nope' })).rejects.toThrow('目标文件夹 nope 不存在');
    expect(await backend.getTree()).toEqual(before);
  });

  it('移动到自身被拒绝且树不被破坏', async () => {
    const backend = createDemoBackend(miniSeed());
    const before = await backend.getTree();
    await expect(backend.move('f', { parentId: 'f' })).rejects.toThrow('不能把文件夹移动到它自己的子文件夹里');
    expect(await backend.getTree()).toEqual(before);
  });

  it('循环移动（移入自己的子孙文件夹）被拒绝且树不被破坏', async () => {
    const seed = miniSeed();
    seed[0].children![0].children![1].children!.push({
      id: 'deep',
      parentId: 'f',
      title: '深层',
      children: [],
    });
    const backend = createDemoBackend(seed);
    const before = await backend.getTree();
    await expect(backend.move('f', { parentId: 'deep' })).rejects.toThrow('不能把文件夹移动到它自己的子文件夹里');
    expect(await backend.getTree()).toEqual(before);
  });
});

describe('remove / removeTree', () => {
  it('删除叶子节点并重排兄弟索引', async () => {
    const backend = createDemoBackend(miniSeed());
    await backend.remove('a');
    const bar = (await backend.getTree())[0].children![0];
    expect(bar.children?.map((node) => node.id)).toEqual(['f']);
    expect(bar.children?.[0].index).toBe(0);
  });

  it('删除不存在的节点时 reject', async () => {
    await expect(createDemoBackend(miniSeed()).remove('ghost')).rejects.toThrow('找不到书签节点 ghost');
  });

  it('非空文件夹禁止普通删除', async () => {
    await expect(createDemoBackend(miniSeed()).remove('f')).rejects.toThrow('该文件夹非空，请使用删除整个文件夹');
  });

  it('空的特殊文件夹也禁止删除', async () => {
    const backend = createDemoBackend(miniSeed());
    await expect(backend.remove('3')).rejects.toThrow('不能删除 Chrome 特殊文件夹');
  });

  it('removeTree 可整体删除非空文件夹', async () => {
    const backend = createDemoBackend(miniSeed());
    await backend.removeTree('f');
    const bar = (await backend.getTree())[0].children![0];
    expect(bar.children?.map((node) => node.id)).toEqual(['a']);
  });

  it('removeTree 保护全部特殊文件夹', async () => {
    const backend = createDemoBackend(miniSeed());
    for (const id of SPECIAL_FOLDER_IDS) {
      await expect(backend.removeTree(id)).rejects.toThrow('不能删除 Chrome 特殊文件夹');
    }
    expect((await backend.getTree())[0].children).toHaveLength(3);
  });

  it('removeTree 删除不存在节点时 reject', async () => {
    await expect(createDemoBackend(miniSeed()).removeTree('ghost')).rejects.toThrow('找不到书签节点 ghost');
  });
});

describe('search / historySearch', () => {
  it('search 忽略大小写并同时匹配标题与 URL', async () => {
    const backend = createDemoBackend(miniSeed());
    expect((await backend.search('甲站')).map((node) => node.id)).toEqual(['a']);
    expect((await backend.search('B.EXAMPLE')).map((node) => node.id)).toEqual(['b']);
    expect((await backend.search('  甲站  ')).map((node) => node.id)).toEqual(['a']);
  });

  it('空查询返回全部书签（不含文件夹）且结果为克隆', async () => {
    const backend = createDemoBackend(miniSeed());
    const results = await backend.search('   ');
    expect(results.map((node) => node.id)).toEqual(['a', 'b']);
    results[0].title = '篡改';
    expect((await backend.search('甲站'))[0].title).toBe('甲站');
  });

  it('无匹配时返回空数组', async () => {
    expect(await createDemoBackend(miniSeed()).search('绝不存在的词')).toEqual([]);
  });

  it('historySearch 按时间窗口过滤并倒序返回', async () => {
    const backend = createDemoBackend();
    const all = await backend.historySearch('', 365, 100);
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i - 1].lastVisitTime).toBeGreaterThanOrEqual(all[i].lastVisitTime);
    }
    const recent = await backend.historySearch('', 1, 100);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThan(all.length);
    const since = Date.now() - 86_400_000;
    expect(recent.every((item) => item.lastVisitTime >= since)).toBe(true);
  });

  it('historySearch 尊重 max 上限并支持关键词过滤', async () => {
    const backend = createDemoBackend();
    expect(await backend.historySearch('', 365, 2)).toHaveLength(2);
    const hits = await backend.historySearch('github', 365, 100);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((item) => item.title.toLowerCase().includes('github') || item.url.toLowerCase().includes('github'))).toBe(true);
  });
});

describe('openUrl / webSearch / openOptions', () => {
  it('openUrl 记录 disposition 并调用 window.open', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const backend = createDemoBackend();
    await backend.openUrl('https://x.example.com/', 'newWindow');
    expect(demoOpened).toEqual([{ url: 'https://x.example.com/', disposition: 'newWindow' }]);
    expect(open).toHaveBeenCalledWith('https://x.example.com/', '_blank', 'noopener,noreferrer');
  });

  it('webSearch 记录编码后的搜索 URL 与 web: 前缀 disposition', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const backend = createDemoBackend();
    await backend.webSearch('书签 管理', 'newTab');
    expect(demoOpened).toEqual([
      { url: `https://www.google.com/search?q=${encodeURIComponent('书签 管理')}`, disposition: 'web:newTab' },
    ]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('openOptions 打开 options.html', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await createDemoBackend().openOptions();
    expect(open).toHaveBeenCalledWith('options.html', '_blank', 'noopener,noreferrer');
  });
});

describe('onChange 订阅', () => {
  it('create/update/move/remove 均触发变更通知', async () => {
    const backend = createDemoBackend(miniSeed());
    const cb = vi.fn();
    backend.onChange(cb);
    const node = await backend.create({ title: '通知', url: 'https://notify.example.com/' });
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
    await backend.update(node.id, { title: '再通知' });
    await backend.move(node.id, { parentId: 'f' });
    await backend.remove(node.id);
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('退订后不再收到通知', async () => {
    const backend = createDemoBackend(miniSeed());
    const cb = vi.fn();
    const unsubscribe = backend.onChange(cb);
    unsubscribe();
    await backend.create({ title: '静默', url: 'https://silent.example.com/' });
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('storage 与 onSettingsChanged', () => {
  it('set/get/remove 经由 localStorage 持久化', async () => {
    const backend = createDemoBackend();
    expect(await backend.storageGet('absent')).toBeUndefined();
    await backend.storageSet('k', { hello: 'world' });
    expect(globalThis.localStorage.getItem('k')).toBe(JSON.stringify({ hello: 'world' }));
    expect(await backend.storageGet<{ hello: string }>('k')).toEqual({ hello: 'world' });
    await backend.storageRemove('k');
    expect(globalThis.localStorage.getItem('k')).toBeNull();
    expect(await backend.storageGet('k')).toBeUndefined();
  });

  it('仅设置键变化时通知设置订阅者', async () => {
    const backend = createDemoBackend();
    const cb = vi.fn();
    backend.onSettingsChanged(cb);
    await backend.storageSet('other-key', 1);
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
    await backend.storageSet(SETTINGS_KEY, { theme: 'light' });
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
    await backend.storageRemove('other-key');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
    await backend.storageRemove(SETTINGS_KEY);
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('设置订阅可退订', async () => {
    const backend = createDemoBackend();
    const cb = vi.fn();
    backend.onSettingsChanged(cb)();
    await backend.storageSet(SETTINGS_KEY, {});
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
  });

  it('无 localStorage 时回退到内存 Map', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    try {
      const backend = createDemoBackend();
      expect(await backend.storageGet('mem-key')).toBeUndefined();
      await backend.storageSet('mem-key', [1, 2, 3]);
      expect(await backend.storageGet<number[]>('mem-key')).toEqual([1, 2, 3]);
      await backend.storageRemove('mem-key');
      expect(await backend.storageGet('mem-key')).toBeUndefined();
      const cb = vi.fn();
      backend.onSettingsChanged(cb);
      await backend.storageSet(SETTINGS_KEY, { theme: 'dark' });
      await flushMicrotasks();
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    expect(globalThis.localStorage).toBeTruthy();
  });
});
describe('storage 自愈（v2 R4.6）', () => {
  it('localStorage 中损坏的 JSON 按缺失处理，不抛错', async () => {
    localStorage.setItem('sbh:settings', '{broken json');
    const backend = createDemoBackend();
    expect(await backend.storageGet('sbh:settings')).toBeUndefined();
  });

  it('损坏数据被覆写后恢复正常读写', async () => {
    localStorage.setItem('sbh:settings', '{broken');
    const backend = createDemoBackend();
    await backend.storageSet('sbh:settings', { theme: 'light' });
    expect(await backend.storageGet<{ theme: string }>('sbh:settings')).toEqual({ theme: 'light' });
  });
});
