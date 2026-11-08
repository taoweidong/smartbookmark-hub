import { describe, expect, it } from 'vitest';
import { flattenTree } from './bookmarks';
import { createFixtureTree } from './fixtures';
import { buildEntries, rankBookmarks, scoreEntry, searchAll, splitTerms } from './search';
import type { SearchEntry } from './types';
async function entries(tags: Record<string, string[]> = {}): Promise<SearchEntry[]> {
  return buildEntries(flattenTree(createFixtureTree()), tags);
}

describe('splitTerms', () => {
  it('小写化并按空白切词，最多 6 个', () => {
    expect(splitTerms('  Chrome   扩展 ')).toEqual(['chrome', '扩展']);
    expect(splitTerms('a b c d e f g h')).toHaveLength(6);
    expect(splitTerms('   ')).toEqual([]);
  });
});

describe('rankBookmarks', () => {
  it('中文标题直接命中', async () => {
    const results = rankBookmarks(await entries(), '知乎', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('知乎');
    expect(results[0].kind).toBe('bookmark');
  });

  it('拼音首字母命中中文书签', async () => {
    const results = rankBookmarks(await entries(), 'zh', 10);
    expect(results.some((result) => result.title.includes('知乎'))).toBe(true);
    expect(results[0].matchedOn).toContain('拼音');
  });

  it('全拼命中中文书签', async () => {
    const results = rankBookmarks(await entries(), 'juejin', 10);
    expect(results.some((result) => result.title.includes('掘金'))).toBe(true);
  });

  it('URL 片段与域名命中', async () => {
    const results = rankBookmarks(await entries(), 'arxiv', 10);
    expect(results.length).toBe(2);
    expect(results.every((result) => result.url.includes('arxiv'))).toBe(true);
  });

  it('多词为 AND 语义，任一词不命中则排除', async () => {
    const list = await entries();
    const hit = rankBookmarks(list, 'chrome 扩展', 10);
    expect(hit.some((result) => result.title.includes('Chrome 扩展开发文档'))).toBe(true);
    expect(rankBookmarks(list, 'chrome zzzznotexist', 10)).toEqual([]);
  });

  it('标签参与匹配', async () => {
    const list = await entries();
    const target = list.find((entry) => entry.title.includes('Excalidraw'))!;
    const tagged = await entries({ [target.id]: ['画图'] });
    const results = rankBookmarks(tagged, '画图', 10);
    expect(results[0].id).toBe(target.id);
    expect(results[0].matchedOn).toContain('标签');
  });

  it('空查询返回空数组，limit 生效', async () => {
    const list = await entries();
    expect(rankBookmarks(list, '', 10)).toEqual([]);
    expect(rankBookmarks(list, 'e', 3)).toHaveLength(3);
  });

  it('标题全等得分高于前缀与包含', async () => {
    const list = await entries();
    const exact = list.find((entry) => entry.titleLower === 'github')!;
    const partial = list.find((entry) => entry.titleLower.includes('github') && entry.titleLower !== 'github')!;
    const terms = ['github'];
    expect(scoreEntry(exact, terms)!.score).toBeGreaterThan(scoreEntry(partial, terms)!.score);
  });
});

describe('searchAll 优先级', () => {
  it('书签永远排在历史之前，网页兜底永远最后', async () => {
    const results = await searchAll(await entries(), 'chrome', {
      includeHistory: true,
      historyDays: 90,
      limit: 20,
    });
    const kinds = results.map((result) => result.kind);
    const lastBookmark = kinds.lastIndexOf('bookmark');
    const firstHistory = kinds.indexOf('history');
    if (firstHistory >= 0) expect(lastBookmark).toBeLessThan(firstHistory);
    expect(kinds[kinds.length - 1]).toBe('web');
    expect(results[results.length - 1].score).toBe(-1);
    expect(results.filter((result) => result.kind === 'history').every((r) => r.score <= 40)).toBe(true);
  });

  it('关闭历史开关后不返回历史项', async () => {
    const results = await searchAll(await entries(), 'chrome', {
      includeHistory: false,
      historyDays: 90,
      limit: 20,
    });
    expect(results.some((result) => result.kind === 'history')).toBe(false);
  });

  it('历史项与书签按归一化 URL 去重', async () => {
    const results = await searchAll(await entries(), 'github', {
      includeHistory: true,
      historyDays: 90,
      limit: 30,
    });
    const urls = results.filter((r) => r.kind !== 'web').map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('空查询不产生任何结果', async () => {
    expect(await searchAll(await entries(), '  ', { includeHistory: true, historyDays: 90, limit: 10 })).toEqual([]);
  });

  it('无命中时仍给出网页搜索兜底', async () => {
    const results = await searchAll(await entries(), 'zzzznope', {
      includeHistory: true,
      historyDays: 90,
      limit: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('web');
    expect(results[0].title).toContain('zzzznope');
  });
});

describe('打分细节', () => {
  function entry(over: Partial<SearchEntry>): SearchEntry {
    return {
      id: 'b1',
      title: '周报',
      url: 'https://work.example.com/report',
      parentId: '1',
      folderPath: ['书签栏', '工作'],
      dateAdded: Date.now(),
      host: 'work.example.com',
      canonicalUrl: 'https://work.example.com/report',
      titleLower: '周报',
      urlLower: 'https://work.example.com/report',
      initials: 'zb',
      pinyinFull: 'zhoubao',
      tags: [],
      folderLower: '书签栏/工作',
      tagLowers: [],
      ...over,
    };
  }

  it('文件夹路径命中并标注 matchedOn', () => {
    const hit = scoreEntry([entry({})][0], ['工作']);
    expect(hit).not.toBeNull();
    expect(hit!.matchedOn).toContain('文件夹');
    expect(hit!.score).toBeGreaterThanOrEqual(15);
  });

  it('标签全等得分高于包含', () => {
    const exact = entry({ tags: ['前端'], tagLowers: ['前端'] });
    const partial = entry({ tags: ['前端工程化'], tagLowers: ['前端工程化'] });
    const terms = ['前端'];
    expect(scoreEntry(exact, terms)!.score).toBeGreaterThan(scoreEntry(partial, terms)!.score);
  });

  it('近 7 天新增获得加成', () => {
    const terms = ['周报'];
    const fresh = scoreEntry(entry({}), terms)!;
    const stale = scoreEntry(entry({ dateAdded: Date.now() - 30 * 86_400_000 }), terms)!;
    expect(fresh.score - stale.score).toBe(10);
  });

  it('过长标题受到惩罚', () => {
    const terms = ['abc'];
    const short = scoreEntry(entry({ title: 'xabc', titleLower: 'xabc' }), terms)!;
    const long = scoreEntry(
      entry({ title: `xabc${'y'.repeat(200)}`, titleLower: `xabc${'y'.repeat(200)}` }),
      terms,
    )!;
    expect(short.score).toBeGreaterThan(long.score);
  });

  it('同一 canonicalUrl 只保留一条结果', () => {
    const list = [
      entry({ id: 'a', url: 'https://dup.com/?utm_source=x', canonicalUrl: 'https://dup.com/', urlLower: 'https://dup.com/?utm_source=x' }),
      entry({ id: 'b', url: 'https://dup.com/', canonicalUrl: 'https://dup.com/', urlLower: 'https://dup.com/' }),
    ];
    const results = rankBookmarks(list, 'dup', 10);
    expect(results).toHaveLength(1);
  });
});