import { describe, expect, it } from 'vitest';
import { bookmarkService, findNode } from './bookmarks';
import { importHtml, parseJsonBackup, parseNetscapeHtml } from './importHtml';

describe('parseNetscapeHtml 结构解析', () => {
  it('解析多层嵌套并为文件夹子节点编排 index', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3 ADD_DATE="1700000000">外层</H3>
      <DL><p>
        <DT><A HREF="https://outer.example.com/" ADD_DATE="1700000001">外页</A>
        <DT><H3>内层</H3>
        <DL><p>
          <DT><A HREF="https://inner.example.com/">内页</A>
        </DL><p>
      </DL><p>
      <DT><A HREF="https://top.example.com/">顶层页</A>
    </DL><p>`;
    const parsed = parseNetscapeHtml(html);
    expect(parsed.folders).toBe(2);
    expect(parsed.bookmarks).toBe(3);
    expect(parsed.tree).toHaveLength(2);

    const outer = parsed.tree[0];
    expect(outer.title).toBe('外层');
    expect(outer.dateAdded).toBe(1700000000 * 1000);
    expect(outer.children?.map((node) => node.index)).toEqual([0, 1]);
    expect(outer.children?.[0].title).toBe('外页');
    expect(outer.children?.[0].dateAdded).toBe(1700000001 * 1000);
    const inner = outer.children![1];
    expect(inner.title).toBe('内层');
    expect(inner.children?.[0].url).toBe('https://inner.example.com/');
    expect(parsed.tree[1].title).toBe('顶层页');
  });

  it('丢弃非 http/https 协议与空 href 的链接', () => {
    const html = `<DL><p>
      <DT><A HREF="ftp://files.example.com/">FTP</A>
      <DT><A HREF="javascript:void(0)">脚本</A>
      <DT><A HREF="chrome://settings/">内部页</A>
      <DT><A HREF="">空链接</A>
      <DT><A HREF="/relative/path">相对路径</A>
      <DT><A HREF="http://legacy.example.com/">HTTP 保留</A>
      <DT><A HREF="https://secure.example.com/">HTTPS 保留</A>
    </DL><p>`;
    const parsed = parseNetscapeHtml(html);
    expect(parsed.bookmarks).toBe(2);
    expect(parsed.tree.map((node) => node.url)).toEqual([
      'http://legacy.example.com/',
      'https://secure.example.com/',
    ]);
  });

  it('空字符串输入返回零计数与空树', () => {
    expect(parseNetscapeHtml('')).toEqual({ folders: 0, bookmarks: 0, tree: [] });
  });

  it('缺失 ADD_DATE 时回退到当前时间', () => {
    const before = Date.now();
    const parsed = parseNetscapeHtml(`<DL><p>
      <DT><H3>无日期文件夹</H3>
      <DL><p><DT><A HREF="https://nodate.example.com/">无日期页</A></DL><p>
    </DL><p>`);
    const after = Date.now();
    const folder = parsed.tree[0];
    expect(folder.dateAdded).toBeGreaterThanOrEqual(before);
    expect(folder.dateAdded).toBeLessThanOrEqual(after);
    const link = folder.children![0];
    expect(link.dateAdded).toBeGreaterThanOrEqual(before);
    expect(link.dateAdded).toBeLessThanOrEqual(after);
  });

  it('非法 ADD_DATE 回退到当前时间而不是 NaN', () => {
    const parsed = parseNetscapeHtml('<DL><p><DT><A HREF="https://bad-date.example.com/" ADD_DATE="abc">页</A></DL><p>');
    expect(Number.isFinite(parsed.tree[0].dateAdded)).toBe(true);
  });

  it('标题为空或纯空白时用 href 兜底，文件夹用默认名', () => {
    const parsed = parseNetscapeHtml(`<DL><p>
      <DT><A HREF="https://fallback.example.com/path"></A>
      <DT><A HREF="https://blank.example.com/">   </A>
      <DT><H3>  </H3>
      <DL><p></DL><p>
    </DL><p>`);
    expect(parsed.tree[0].title).toBe('https://fallback.example.com/path');
    expect(parsed.tree[1].title).toBe('https://blank.example.com/');
    expect(parsed.tree[2].title).toBe('未命名文件夹');
  });

  it('每次解析重新编号临时 id', () => {
    const html = '<DL><p><DT><A HREF="https://seq.example.com/">页</A></DL><p>';
    const first = parseNetscapeHtml(html);
    const second = parseNetscapeHtml(html);
    expect(first.tree[0].id).toBe(second.tree[0].id);
  });
});

describe('importHtml 入库', () => {
  it('创建根文件夹并递归创建全部子节点，返回准确计数', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3>导入文件夹</H3>
      <DL><p>
        <DT><A HREF="https://one.example.com/">一</A>
        <DT><A HREF="https://two.example.com/">二</A>
      </DL><p>
    </DL><p>`;
    const result = await importHtml(html, '测试导入根');
    expect(result).toEqual({ created: 4, folders: 1 });

    const tree = await bookmarkService.getTree();
    const bar = findNode(tree, '1')!;
    const root = bar.children!.find((node) => node.title === '测试导入根')!;
    expect(root.url).toBeUndefined();
    expect(root.children).toHaveLength(1);
    const folder = root.children![0];
    expect(folder.title).toBe('导入文件夹');
    expect(folder.children?.map((node) => node.url)).toEqual([
      'https://one.example.com/',
      'https://two.example.com/',
    ]);
    expect(folder.children?.every((node) => node.parentId === folder.id)).toBe(true);
  });

  it('支持指定 parentId 导入到书签栏以外', async () => {
    const html = '<DL><p><DT><A HREF="https://elsewhere.example.com/">别处</A></DL><p>';
    const result = await importHtml(html, '其他导入', '2');
    expect(result.created).toBe(2);
    const tree = await bookmarkService.getTree();
    const other = findNode(tree, '2')!;
    const root = other.children!.find((node) => node.title === '其他导入')!;
    expect(root.children?.[0].url).toBe('https://elsewhere.example.com/');
  });

  it('无可导入内容时 reject 且不创建根文件夹', async () => {
    await expect(importHtml('<html><body>空</body></html>', '空根')).rejects.toThrow('没有可导入的书签');
    const tree = await bookmarkService.getTree();
    expect(findNode(tree, '1')!.children!.some((node) => node.title === '空根')).toBe(false);
  });

  it('仅含非法协议链接时同样 reject', async () => {
    const html = '<DL><p><DT><A HREF="javascript:alert(1)">恶意</A></DL><p>';
    await expect(importHtml(html, '非法根')).rejects.toThrow('仅接受 http/https 链接');
  });
});

describe('parseJsonBackup 校验', () => {
  it('拒绝错误的 format 标记', () => {
    expect(() => parseJsonBackup(JSON.stringify({ format: 'other-app', tree: [] }))).toThrow(
      '不是 SmartBookmark Hub 的 JSON 备份文件',
    );
  });

  it('拒绝 tree 非数组的备份', () => {
    expect(() => parseJsonBackup(JSON.stringify({ format: 'smartbookmark-hub', tree: { id: '1' } }))).toThrow(
      '不是 SmartBookmark Hub 的 JSON 备份文件',
    );
    expect(() => parseJsonBackup(JSON.stringify({ format: 'smartbookmark-hub' }))).toThrow(
      '不是 SmartBookmark Hub 的 JSON 备份文件',
    );
  });

  it('非法 JSON 文本直接抛错', () => {
    expect(() => parseJsonBackup('{broken')).toThrow();
  });

  it('过滤脏 tags：非数组、空数组、混入非字符串项全部丢弃', () => {
    const text = JSON.stringify({
      format: 'smartbookmark-hub',
      tree: [],
      tags: {
        good: ['工作', '重要'],
        str: '不是数组',
        empty: [],
        mixed: ['合法', 42],
        nested: [['嵌套']],
        nil: null,
      },
    });
    expect(parseJsonBackup(text).tags).toEqual({ good: ['工作', '重要'] });
  });

  it('tags 缺失或形状非法时返回空映射', () => {
    const base = { format: 'smartbookmark-hub', tree: [] };
    expect(parseJsonBackup(JSON.stringify(base)).tags).toEqual({});
    expect(parseJsonBackup(JSON.stringify({ ...base, tags: 'dirty' })).tags).toEqual({});
    expect(parseJsonBackup(JSON.stringify({ ...base, tags: null })).tags).toEqual({});
  });

  it('合法备份原样返回树与标签', () => {
    const tree = [{ id: 'n1', title: '页', url: 'https://keep.example.com/' }];
    const tags = { n1: ['保留'] };
    const parsed = parseJsonBackup(JSON.stringify({ format: 'smartbookmark-hub', tree, tags }));
    expect(parsed.tree).toEqual(tree);
    expect(parsed.tags).toEqual(tags);
  });
});