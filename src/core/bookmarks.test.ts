import { describe, expect, it } from 'vitest';
import { getBackend } from './backend';
import {
  bookmarkService,
  bookmarksInFolder,
  collectFolders,
  countBookmarks,
  findNode,
  flattenTree,
  folderPathOf,
  isFolder,
} from './bookmarks';
import { createFixtureTree } from './fixtures';

describe('flattenTree', () => {
  it('展平书签并给出不含根的文件夹路径', () => {
    const flat = flattenTree(createFixtureTree());
    const item = flat.find((entry) => entry.title === '飞书文档 - 季度规划');
    expect(item).toBeDefined();
    expect(item?.folderPath).toEqual(['书签栏', '工作']);
    expect(item?.url).toBe('https://bytedance.feishu.cn/docs/quarterly-plan');
    expect(item?.dateAdded).toBeGreaterThan(0);
  });

  it('结果中不包含文件夹自身', () => {
    const flat = flattenTree(createFixtureTree());
    expect(flat.every((entry) => Boolean(entry.url))).toBe(true);
    expect(flat.some((entry) => entry.title === '工作')).toBe(false);
  });

  it('空树返回空数组', () => {
    expect(flattenTree([])).toEqual([]);
  });
});

describe('collectFolders', () => {
  it('统计直接数量与递归数量并标记特殊文件夹', () => {
    const folders = collectFolders(createFixtureTree());
    const work = folders.find((folder) => folder.title === '工作');
    expect(work?.directCount).toBe(9);
    expect(work?.totalCount).toBe(11);
    expect(work?.depth).toBe(1);
    expect(work?.special).toBe(false);

    const bar = folders.find((folder) => folder.id === '1');
    expect(bar?.special).toBe(true);

    const archive = folders.find((folder) => folder.title === '归档');
    expect(archive?.totalCount).toBe(0);
  });

  it('不收录根节点 0', () => {
    expect(collectFolders(createFixtureTree()).some((folder) => folder.id === '0')).toBe(false);
  });
});

describe('树查询辅助', () => {
  it('findNode / isFolder / folderPathOf / countBookmarks 正常工作', () => {
    const tree = createFixtureTree();
    const work = findNode(tree, '1')?.children?.find((node) => node.title === '工作');
    expect(work).toBeDefined();
    expect(isFolder(work!)).toBe(true);
    expect(folderPathOf(tree, work!.id)).toEqual(['书签栏']);
    expect(countBookmarks(tree)).toBe(flattenTree(tree).length);
    expect(bookmarksInFolder(tree, work!.id).length).toBe(11);
  });
});

describe('bookmarkService 变更操作', () => {
  it('创建书签后出现在目标文件夹', async () => {
    const created = await bookmarkService.create({
      parentId: '1',
      title: '新书签',
      url: 'https://example.org/new',
    });
    const flat = await bookmarkService.getFlat();
    expect(flat.some((entry) => entry.id === created.id && entry.parentId === '1')).toBe(true);
  });

  it('更新标题与 URL', async () => {
    const created = await bookmarkService.create({
      parentId: '1',
      title: '旧标题',
      url: 'https://example.org/old',
    });
    await bookmarkService.update(created.id, { title: '新标题', url: 'https://example.org/new' });
    const node = findNode(await bookmarkService.getTree(), created.id);
    expect(node?.title).toBe('新标题');
    expect(node?.url).toBe('https://example.org/new');
  });

  it('移动到另一个文件夹并更新索引', async () => {
    const tree = await bookmarkService.getTree();
    const other = findNode(tree, '2')!;
    const created = await bookmarkService.create({
      parentId: '1',
      title: '待移动',
      url: 'https://example.org/move',
    });
    await bookmarkService.move(created.id, { parentId: '2', index: 0 });
    const moved = findNode(await bookmarkService.getTree(), created.id);
    expect(moved?.parentId).toBe(other.id);
    expect(moved?.index).toBe(0);
  });

  it('删除文件夹走 removeTree，删除书签走 remove', async () => {
    const backend = getBackend();
    const folder = await backend.create({ parentId: '1', title: '空文件夹' });
    await bookmarkService.remove(folder.id);
    expect(findNode(await backend.getTree(), folder.id)).toBeUndefined();

    const site = await backend.create({
      parentId: '1',
      title: '站点',
      url: 'https://example.org/x',
    });
    await bookmarkService.remove(site.id);
    expect(findNode(await backend.getTree(), site.id)).toBeUndefined();
  });

  it('拒绝删除 Chrome 特殊文件夹', async () => {
    await expect(bookmarkService.remove('1')).rejects.toThrow();
  });
});