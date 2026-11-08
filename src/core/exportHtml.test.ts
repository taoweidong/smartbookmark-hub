import { describe, expect, it } from 'vitest';
import { bookmarkService, collectFolders, findNode, flattenTree } from './bookmarks';
import { createFixtureTree } from './fixtures';
import { toJsonBackup, toNetscapeHtml } from './exportHtml';
import { importHtml, parseJsonBackup, parseNetscapeHtml } from './importHtml';
import type { BookmarkNode } from './types';

describe('toNetscapeHtml', () => {
  const tree = createFixtureTree();

  it('以标准 DOCTYPE 开头并包含书签栏标记', () => {
    const html = toNetscapeHtml(tree);
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<TITLE>Bookmarks</TITLE>');
    expect(html).toContain('PERSONAL_TOOLBAR_FOLDER="true"');
    expect(html).toContain('<DL><p>');
    expect(html).toContain('</DL><p>');
  });

  it('ADD_DATE 使用秒级时间戳', () => {
    const node = flattenTree(tree)[0];
    const html = toNetscapeHtml(tree);
    expect(html).toContain(`ADD_DATE="${Math.floor(node.dateAdded / 1000)}"`);
  });

  it('转义标题与 URL 中的特殊字符', () => {
    const custom: BookmarkNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            children: [
              { id: 'x', title: '<script>&"标题"', url: 'https://a.com/?a=1&b=2', parentId: '1' },
            ],
          },
        ],
      },
    ];
    const html = toNetscapeHtml(custom);
    expect(html).toContain('&lt;script&gt;&amp;&quot;标题&quot;');
    expect(html).toContain('a=1&amp;b=2');
    expect(html).not.toContain('<script>');
  });

  it('导出标签属性', () => {
    const html = toNetscapeHtml(tree, { [flattenTree(tree)[0].id]: ['工作', '重要'] });
    expect(html).toContain('TAGS="工作,重要"');
  });
});

describe('parseNetscapeHtml', () => {
  it('往返解析保持书签与文件夹数量', () => {
    const tree = createFixtureTree();
    const parsed = parseNetscapeHtml(toNetscapeHtml(tree));
    expect(parsed.bookmarks).toBe(flattenTree(tree).length);
    expect(parsed.folders).toBe(collectFolders(tree).length);
  });

  it('丢弃非 http 链接与脚本内容', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><A HREF="javascript:alert(1)">恶意</A>
      <DT><A HREF="https://safe.com/">安全</A>
      <DT><H3>文件夹</H3>
      <DL><p><DT><A HREF="chrome://settings/">内部</A></DL><p>
    </DL><p><script>alert(1)</script>`;
    const parsed = parseNetscapeHtml(html);
    expect(parsed.bookmarks).toBe(1);
    expect(parsed.folders).toBe(1);
    expect(JSON.stringify(parsed.tree)).not.toContain('javascript:');
    expect(JSON.stringify(parsed.tree)).not.toContain('alert');
  });

  it('空文件返回零计数', () => {
    expect(parseNetscapeHtml('<html><body>什么都没有</body></html>')).toEqual({
      folders: 0,
      bookmarks: 0,
      tree: [],
    });
  });
});

describe('importHtml', () => {
  it('导入到新建独立文件夹且不覆盖现有书签', async () => {
    const before = flattenTree(await bookmarkService.getTree()).length;
    const html = toNetscapeHtml(createFixtureTree());
    const result = await importHtml(html, '导入备份');
    expect(result.created).toBe(1 + before + collectFolders(createFixtureTree()).length);

    const tree = await bookmarkService.getTree();
    const root = findNode(tree, '1')!.children!.find((node) => node.title === '导入备份')!;
    expect(root.children?.length).toBeGreaterThan(0);
    expect(flattenTree(tree).length).toBe(before * 2);
  });

  it('无可导入内容时抛错', async () => {
    await expect(importHtml('<html></html>', '空导入')).rejects.toThrow('没有可导入的书签');
  });
});

describe('JSON 备份', () => {
  it('导出后可解析回树与标签', () => {
    const tree = createFixtureTree();
    const tags = { x: ['a'] };
    const parsed = parseJsonBackup(toJsonBackup(tree, tags));
    expect(parsed.tree).toHaveLength(1);
    expect(parsed.tags).toEqual(tags);
  });

  it('拒绝格式不符的文件', () => {
    expect(() => parseJsonBackup('{"tree":[]}')).toThrow('不是 SmartBookmark Hub 的 JSON 备份文件');
    expect(() => parseJsonBackup('not json')).toThrow();
  });
});