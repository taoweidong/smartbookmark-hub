import { describe, expect, it } from 'vitest';
import type { FlatBookmark } from '../types';
import { findDuplicates, titleSimilarity } from './duplicates';

const DAY = 86_400_000;

function bm(id: string, title: string, url: string, daysAgo = 10): FlatBookmark {
  return {
    id,
    title,
    url,
    parentId: '1',
    folderPath: ['书签栏'],
    dateAdded: Date.now() - daysAgo * DAY,
  };
}

const opts = { ignoreWww: true, titleThreshold: 0.86 };

describe('titleSimilarity', () => {
  it('完全相同为 1，完全不同接近 0', () => {
    expect(titleSimilarity('React 官方文档', 'React 官方文档')).toBe(1);
    expect(titleSimilarity('React 官方文档', 'Vue 框架指南')).toBeLessThan(0.4);
  });

  it('包含关系的高相似标题超过阈值', () => {
    expect(titleSimilarity('React 官方文档', 'React 官方文档（中文）')).toBeGreaterThanOrEqual(0.86);
  });

  it('空标题返回 0', () => {
    expect(titleSimilarity('', 'abc')).toBe(0);
  });
});

describe('findDuplicates', () => {
  it('跟踪参数差异的同一 URL 成组', () => {
    const groups = findDuplicates(
      [
        bm('a', 'GitHub 仓库', 'https://github.com/a/b', 100),
        bm('b', 'GitHub 仓库', 'https://github.com/a/b?utm_source=wechat', 5),
      ],
      opts,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('url');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].similarity).toBe(1);
  });

  it('保留最早收藏的一项', () => {
    const groups = findDuplicates(
      [
        bm('new', '站点', 'https://site.com/p', 1),
        bm('old', '站点', 'https://site.com/p?ref=x', 300),
      ],
      opts,
    );
    expect(groups[0].keepId).toBe('old');
  });

  it('ignoreWww 开关决定是否合并 www 与裸域名', () => {
    const items = [
      bm('a', '站点甲', 'https://www.site.com/p'),
      bm('b', '站点乙', 'https://site.com/p'),
    ];
    expect(findDuplicates(items, { ...opts, ignoreWww: true })).toHaveLength(1);
    expect(findDuplicates(items, { ...opts, ignoreWww: false })).toHaveLength(0);
  });

  it('跨 host 的相同归一化标题成组并标记 title', () => {
    const groups = findDuplicates(
      [
        bm('a', '同一个教程', 'https://a.com/post'),
        bm('b', '同一个教程！', 'https://b.com/article'),
      ],
      opts,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('title');
  });

  it('同 host 高相似标题成组，低相似不成组', () => {
    const similar = findDuplicates(
      [
        bm('a', 'React 官方文档', 'https://react.dev/learn'),
        bm('b', 'React 官方文档（中文）', 'https://react.dev/zh-hans/learn'),
      ],
      opts,
    );
    expect(similar).toHaveLength(1);
    expect(similar[0].reason).toBe('title');
    expect(similar[0].similarity).toBeGreaterThanOrEqual(0.86);

    const dissimilar = findDuplicates(
      [
        bm('a', 'React 官方文档', 'https://react.dev/learn'),
        bm('b', 'Vue 框架指南', 'https://react.dev/vue'),
      ],
      opts,
    );
    expect(dissimilar).toHaveLength(0);
  });

  it('不同 host 的相似但不相同标题不会误合并', () => {
    const groups = findDuplicates(
      [
        bm('a', 'React 官方文档', 'https://react.dev/learn'),
        bm('b', 'React 官方文档（中文）', 'https://other.com/learn'),
      ],
      opts,
    );
    expect(groups).toHaveLength(0);
  });

  it('每个书签只出现在一个分组中', () => {
    const groups = findDuplicates(
      [
        bm('a', '教程', 'https://a.com/p?utm_source=x', 30),
        bm('b', '教程', 'https://a.com/p', 20),
        bm('c', '教程', 'https://a.com/p?fbclid=y', 10),
      ],
      opts,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
  });

  it('少于两条或无重复时返回空数组', () => {
    expect(findDuplicates([], opts)).toEqual([]);
    expect(findDuplicates([bm('a', '唯一', 'https://a.com/')], opts)).toEqual([]);
    expect(
      findDuplicates([bm('a', '甲', 'https://a.com/'), bm('b', '乙', 'https://b.com/')], opts),
    ).toEqual([]);
  });
});