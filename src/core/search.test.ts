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