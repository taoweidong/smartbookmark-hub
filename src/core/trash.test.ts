import { describe, expect, it } from 'vitest';
import { getBackend } from './backend';
import { bookmarkService, findNode } from './bookmarks';
import { deleteWithUndo, listTrash, purgeAll, purgeBatch, restoreBatch, snapshotNodes } from './trash';

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