import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@/core/types';
import { parseSuggestionContent, toSuggestions, WEB_PREFIX } from './suggestions';

function result(kind: SearchResult['kind'], title: string, url: string, score: number): SearchResult {
  return { kind, id: `${kind}:${url}`, title, url, subtitle: '', score, matchedOn: '' };
}

describe('toSuggestions', () => {
  it('保持书签在历史之前、网页兜底在最后', () => {
    const suggestions = toSuggestions([
      result('bookmark', '知乎 - 问题', 'https://www.zhihu.com/q/1', 90),
      result('history', '历史文章', 'https://blog.com/post', 30),
      result('web', '在默认搜索引擎中搜索“测试”', '', -1),
    ]);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].content).toBe('https://www.zhihu.com/q/1');
    expect(suggestions[1].description).toContain('[历史]');
    expect(suggestions[2].content).toBe(`${WEB_PREFIX}测试`);
  });

  it('对 XML 特殊字符转义', () => {
    const suggestions = toSuggestions([
      result('bookmark', 'A & B <C> "D"', 'https://a.com/p', 10),
    ]);
    expect(suggestions[0].description).toContain('A &amp; B &lt;C&gt;');
    expect(suggestions[0].description).not.toContain('<C>');
    expect(suggestions[0].description).not.toContain('A & B');
  });

  it('截断过长标题', () => {
    const suggestions = toSuggestions([result('bookmark', 'x'.repeat(200), 'https://a.com/', 10)]);
    expect(suggestions[0].description.length).toBeLessThan(200);
    expect(suggestions[0].description).toContain('…');
  });

  it('空结果返回空数组', () => {
    expect(toSuggestions([])).toEqual([]);
  });
});

describe('parseSuggestionContent', () => {
  it('区分网页搜索与 URL', () => {
    expect(parseSuggestionContent(`${WEB_PREFIX}你好`)).toEqual({ kind: 'web', text: '你好' });
    expect(parseSuggestionContent('https://a.com/')).toEqual({ kind: 'url', url: 'https://a.com/' });
  });
});