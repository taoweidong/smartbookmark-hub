import { describe, expect, it, vi } from 'vitest';
import { getBackend, setBackend } from './backend';
import { bookmarkService, findNode, flattenTree } from './bookmarks';
import { CACHE_PREFIX, cache } from './cache';
import { createChromeLikeBackend } from '@/test/chromeMock';
import { deleteWithUndo, listTrash, purgeAll, purgeBatch, restoreBatch, snapshotNodes } from './trash';
import type { BookmarkNode, TrashBatch } from './types';

describe('snapshotNodes', () => {
  it('文件夹快照包含完整子树与父级路径', async () => {
    const tree = await bookmarkService.getTree();
    const work = findNode(tree, '1')!.children!.find((node) => node.title === '工作')!;
    const nodes = snapshotNodes(tree, [work.id]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].parentTitles).toEqual(['书签栏']);
    expect(nodes[0].children).toHaveLength(11);
    expect(nodes[0].children?.find((child) => child.title === '会议记录')?.children).toHaveLength(2);
  });

  it('排除特殊文件夹，并去掉已被选中父级覆盖的子节点', async () => {
    const tree = await bookmarkService.getTree();
    expect(snapshotNodes(tree, ['1'])).toEqual([]);
    const work = findNode(tree, '1')!.children!.find((node) => node.title === '工作')!;
    const meeting = work.children!.find((node) => node.title === '会议记录')!;
    expect(snapshotNodes(tree, [work.id, meeting.id])).toHaveLength(1);
  });
});

describe('deleteWithUndo / restoreBatch', () => {
  it('删除后进入回收站且原生树中消失', async () => {
    const created = await bookmarkService.create({
      parentId: '1',
      title: '待删除',
      url: 'https://example.org/delete',
    });
    const batch = await deleteWithUndo([created.id], '删除 1 项');
    expect(findNode(await bookmarkService.getTree(), created.id)).toBeUndefined();
    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe(batch.id);
    expect(trash[0].label).toBe('删除 1 项');
  });

  it('撤销后恢复到原父文件夹与原索引', async () => {
    const created = await bookmarkService.create({
      parentId: '1',
      index: 0,
      title: '恢复目标',
      url: 'https://example.org/restore',
    });
    const batch = await deleteWithUndo([created.id], '删除');
    const result = await restoreBatch(batch.id);
    expect(result.restored).toBe(1);
    expect(result.fallback).toBe(0);

    const bar = findNode(await bookmarkService.getTree(), '1')!;
    expect(bar.children?.[0].title).toBe('恢复目标');
    expect(bar.children?.[0].url).toBe('https://example.org/restore');
    expect(await listTrash()).toHaveLength(0);
  });

  it('文件夹连同子树一起恢复', async () => {
    const folder = await bookmarkService.create({ parentId: '1', title: '临时文件夹' });
    await bookmarkService.create({
      parentId: folder.id,
      title: '子书签',
      url: 'https://example.org/child',
    });
    const batch = await deleteWithUndo([folder.id], '删除文件夹');
    const result = await restoreBatch(batch.id);
    expect(result.restored).toBe(2);

    const tree = await bookmarkService.getTree();
    const restored = findNode(tree, '1')!.children!.find((node) => node.title === '临时文件夹')!;
    expect(restored.children).toHaveLength(1);
    expect(restored.children?.[0].title).toBe('子书签');
  });

  it('原父文件夹已不存在时重建父链并计入 fallback', async () => {
    const folder = await bookmarkService.create({ parentId: '1', title: '会被删掉的父级' });
    const child = await bookmarkService.create({
      parentId: folder.id,
      title: '孤儿书签',
      url: 'https://example.org/orphan',
    });
    const batch = await deleteWithUndo([child.id], '删除孤儿');
    await getBackend().removeTree(folder.id);

    const result = await restoreBatch(batch.id);
    expect(result.restored).toBe(1);
    expect(result.fallback).toBe(1);

    const tree = await bookmarkService.getTree();
    const rebuilt = findNode(tree, '1')!.children!.find((node) => node.title === '会被删掉的父级')!;
    expect(rebuilt.children?.[0].title).toBe('孤儿书签');
  });

  it('没有可删除项时抛错', async () => {
    await expect(deleteWithUndo(['1'], '无效删除')).rejects.toThrow('没有可删除的书签');
  });

  it('purgeBatch 与 purgeAll 清空回收站', async () => {
    const a = await bookmarkService.create({ parentId: '1', title: '甲', url: 'https://a.com/' });
    const b = await bookmarkService.create({ parentId: '1', title: '乙', url: 'https://b.com/' });
    const batchA = await deleteWithUndo([a.id], '甲');
    await deleteWithUndo([b.id], '乙');
    expect(await listTrash()).toHaveLength(2);

    await purgeBatch(batchA.id);
    expect(await listTrash()).toHaveLength(1);

    await purgeAll();
    expect(await listTrash()).toHaveLength(0);
  });

  it('恢复不存在的批次时抛错', async () => {
    await expect(restoreBatch('missing')).rejects.toThrow('回收站中找不到该批次');
  });
});

describe('listTrash 排序', () => {
  it('按删除时间倒序，最新批次在前', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_700_000_000_000);
      const a = await bookmarkService.create({ parentId: '1', title: '早', url: 'https://early.example.com/' });
      const batchA = await deleteWithUndo([a.id], '早批次');
      vi.setSystemTime(1_700_000_060_000);
      const b = await bookmarkService.create({ parentId: '1', title: '晚', url: 'https://late.example.com/' });
      await deleteWithUndo([b.id], '晚批次');

      const batches = await listTrash();
      expect(batches).toHaveLength(2);
      expect(batches[0].label).toBe('晚批次');
      expect(batches[0].deletedAt).toBeGreaterThan(batchA.deletedAt);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Chrome 语义边界（chromeMock）', () => {
  const chromeTree = (): BookmarkNode[] => [
    { id: '0', title: '', children: [{ id: '1', title: '书签栏', children: [] }] },
  ];

  it('恢复时越界 index 被 clamp，不再触发 Index out of bounds', async () => {
    setBackend(createChromeLikeBackend(chromeTree()));
    const batch: TrashBatch = {
      id: 't-oob',
      deletedAt: Date.now(),
      label: '越界恢复',
      nodes: [
        {
          id: 'old-1',
          title: '页面',
          url: 'https://x.example.com/',
          parentId: '1',
          parentTitles: ['书签栏'],
          index: 5,
        },
      ],
    };
    await cache.set(CACHE_PREFIX.trash + batch.id, batch);

    const result = await restoreBatch(batch.id);
    expect(result.restored).toBe(1);
    const tree = await getBackend().getTree();
    const restored = tree[0].children![0].children![0];
    expect(restored.title).toBe('页面');
    expect(await listTrash()).toHaveLength(0);
  });

  it('删除中途失败：批次只保留已删除节点，失败节点不入回收站', async () => {
    const a = await bookmarkService.create({ parentId: '1', title: '会成功', url: 'https://ok.example.com/' });
    const b = await bookmarkService.create({ parentId: '1', title: '会失败', url: 'https://fail.example.com/' });
    const backend = getBackend();
    const removeOriginal = backend.remove.bind(backend);
    vi.spyOn(backend, 'remove').mockImplementation(async (id: string) => {
      if (id === b.id) throw new Error('模拟删除失败');
      return removeOriginal(id);
    });

    await expect(deleteWithUndo([a.id, b.id], '部分失败')).rejects.toThrow('模拟删除失败');

    const batches = await listTrash();
    expect(batches).toHaveLength(1);
    expect(batches[0].nodes.map((node) => node.title)).toEqual(['会成功']);

    const result = await restoreBatch(batches[0].id);
    expect(result.restored).toBe(1);
    const tree = await bookmarkService.getTree();
    expect(flattenTree(tree).some((item) => item.title === '会成功')).toBe(true);
  });

  it('恢复中断时补偿已创建节点，批次保留可重试', async () => {
    const a = await bookmarkService.create({ parentId: '1', title: '第一项', url: 'https://r1.example.com/' });
    const b = await bookmarkService.create({ parentId: '1', title: '第二项', url: 'https://r2.example.com/' });
    const batch = await deleteWithUndo([a.id, b.id], '中断恢复');
    expect(await listTrash()).toHaveLength(1);

    const backend = getBackend();
    const createOriginal = backend.create.bind(backend);
    let createCount = 0;
    vi.spyOn(backend, 'create').mockImplementation(async (input) => {
      createCount += 1;
      if (createCount >= 2) throw new Error('模拟创建失败');
      return createOriginal(input);
    });

    await expect(restoreBatch(batch.id)).rejects.toThrow('模拟创建失败');
    // 批次仍在，可重试
    expect(await listTrash()).toHaveLength(1);
    // 已创建的节点被补偿移除
    const tree = await bookmarkService.getTree();
    expect(flattenTree(tree).some((item) => item.title === '第一项')).toBe(false);
  });
});
describe('兜底父文件夹补偿与取树优化（v2 R4.3）', () => {
  it('恢复中断时，ensureParent 重建的父文件夹也被补偿移除', async () => {
    const folder = await bookmarkService.create({ parentId: '1', title: '重建父' });
    const child = await bookmarkService.create({ parentId: folder.id, title: '孤儿', url: 'https://orphan2.example.com/' });
    const batch = await deleteWithUndo([child.id], '删除孤儿2');
    await getBackend().removeTree(folder.id);

    const backend = getBackend();
    const createOriginal = backend.create.bind(backend);
    let calls = 0;
    vi.spyOn(backend, 'create').mockImplementation(async (input) => {
      calls += 1;
      if (calls >= 2) throw new Error('模拟创建失败'); // 第 1 次：ensureParent 重建父；第 2 次：recreate 子节点
      return createOriginal(input);
    });

    await expect(restoreBatch(batch.id)).rejects.toThrow('模拟创建失败');
    const tree = await bookmarkService.getTree();
    expect(JSON.stringify(tree).includes('重建父')).toBe(false);
  });
});
