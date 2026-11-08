import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkService, flattenTree } from './bookmarks';
import { buildEntries } from './search';
import { getBackend } from './backend';
import { store } from './store';

async function seedEntries(count = 1): Promise<void> {
  const flat = Array.from({ length: count }, (_, index) => ({
    id: `b${index + 1}`,
    title: index === 0 ? '知乎' : `书签${index}`,
    url: `https://site${index}.example.com/`,
    parentId: '1',
    folderPath: ['书签栏'],
    dateAdded: Date.now() - index * 1000,
  }));
  store.setState({ entries: await buildEntries(flat, {}), flat });
}

describe('store.init', () => {
  it('首次 init 载入书签并为默认页签种子常用文件夹', async () => {
    await store.getState().init();

    expect(store.getState().initialized).toBe(true);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().flat.length).toBeGreaterThan(0);
    expect(store.getState().settings.dashboard.seeded).toBe(true);
    expect(store.getState().settings.dashboard.tabs[0].folderIds.length).toBeGreaterThan(0);
  });

  it('重复 init 不会重复种子与重复订阅', async () => {
    await store.getState().init();
    const first = store.getState().settings.dashboard.tabs[0].folderIds;
    await store.getState().init();
    expect(store.getState().settings.dashboard.tabs[0].folderIds).toEqual(first);
  });
});

describe('store.refresh', () => {
  it('书签被删除后自动清洗失效的选择项', async () => {
    await store.getState().init();
    const flat = store.getState().flat;
    const victim = flat[0];

    store.getState().selectMany([victim.id, 'ghost-id']);
    expect(store.getState().selectedIds).toContain(victim.id);

    await bookmarkService.remove(victim.id);
    await store.getState().refresh();

    expect(store.getState().selectedIds).not.toContain(victim.id);
    expect(store.getState().selectedIds).not.toContain('ghost-id');
  });

  it('重建 entries 并保持 tree/flat/totalCount 一致', async () => {
    await store.getState().init();
    const { tree, flat, totalCount } = store.getState();
    expect(flat).toEqual(flattenTree(tree));
    expect(totalCount).toBe(flat.length);
  });
});

describe('store.runSearch', () => {
  it('按当前 entries 产出书签结果与网页兜底', async () => {
    await seedEntries(2);
    store.getState().setQuery('知乎');
    await store.getState().runSearch('知乎');
    const results = store.getState().results;
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].kind).toBe('bookmark');
    expect(results[0].title).toBe('知乎');
    expect(results[results.length - 1].kind).toBe('web');
  });

  it('查询已被更新时丢弃过期结果（竞态防护）', async () => {
    await seedEntries(1);
    const pending = store.getState().runSearch('知乎');
    store.getState().setQuery('别的词');
    await pending;
    expect(store.getState().results).toEqual([]);
    expect(store.getState().searching).toBe(false);
  });

  it('空查询直接清空结果', async () => {
    await seedEntries(1);
    store.setState({ results: [{ kind: 'web', id: 'w', title: '', url: '', subtitle: '', score: -1, matchedOn: '' }] });
    await store.getState().runSearch('   ');
    expect(store.getState().results).toEqual([]);
  });
});

describe('store.mutate', () => {
  it('成功时刷新并推送成功 toast', async () => {
    await store.getState().init();
    const ok = await store.getState().mutate('操作完成', async () => {});
    expect(ok).toBe(true);
    const toast = store.getState().toasts.find((item) => item.message === '操作完成');
    expect(toast?.tone).toBe('success');
  });

  it('失败时返回 false 并推送危险 toast', async () => {
    await store.getState().init();
    const ok = await store.getState().mutate('会失败', async () => {
      throw new Error('后端爆炸');
    });
    expect(ok).toBe(false);
    const toast = store.getState().toasts.find((item) => item.message === '后端爆炸');
    expect(toast?.tone).toBe('danger');
  });
});

describe('store.pushToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('最多保留 4 条 toast', () => {
    for (let i = 0; i < 6; i += 1) store.getState().pushToast({ message: `m${i}`, tone: 'info' });
    const messages = store.getState().toasts.map((toast) => toast.message);
    expect(store.getState().toasts).toHaveLength(4);
    expect(messages).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('普通 toast 4.2s 后自动消失', () => {
    store.getState().pushToast({ message: '临时', tone: 'info' });
    vi.advanceTimersByTime(4199);
    expect(store.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getState().toasts).toHaveLength(0);
  });

  it('带撤销的 toast 保留到 8s 撤销窗口结束', () => {
    store.getState().pushToast({ message: '可撤销', tone: 'warning', undo: () => {} });
    vi.advanceTimersByTime(4200);
    expect(store.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3800);
    expect(store.getState().toasts).toHaveLength(0);
  });

  it('dismissToast 立即移除并清理定时器', () => {
    const id = store.getState().pushToast({ message: '手动', tone: 'info' });
    store.getState().dismissToast(id);
    expect(store.getState().toasts).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(store.getState().toasts).toHaveLength(0);
  });
});

describe('store.setQuery', () => {
  it('空查询立即清空结果与 searching', () => {
    store.setState({ results: [{ kind: 'web', id: 'w', title: '', url: '', subtitle: '', score: -1, matchedOn: '' }], searching: true });
    store.getState().setQuery('');
    expect(store.getState().results).toEqual([]);
    expect(store.getState().searching).toBe(false);
  });
});

describe('store.updateSettings 失败兜底', () => {
  it('存储写入失败时推送危险 toast 且不向上抛出', async () => {
    await store.getState().init();
    const backend = getBackend();
    const before = store.getState().settings.theme;
    vi.spyOn(backend, 'storageSet').mockRejectedValueOnce(new Error('写入失败'));

    await expect(store.getState().updateSettings({ theme: 'light' })).resolves.toBeUndefined();

    expect(store.getState().toasts.some((toast) => toast.message === '写入失败')).toBe(true);
    expect(store.getState().settings.theme).toBe(before);
  });
});
