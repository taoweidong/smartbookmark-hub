import { describe, expect, it, vi } from 'vitest';
import { setBackend } from '../backend';
import { createDemoBackend } from '../demoBackend';
import type { BookmarkNode } from '../types';
import { listReports, loadReport, runScan, type ScanOptions } from './scan';

function seed(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          parentId: '0',
          children: [
            { id: '10', title: '正常', url: 'https://good.com/a', parentId: '1', dateAdded: 1000 },
            { id: '11', title: '死链', url: 'https://dead.com/a', parentId: '1', dateAdded: 2000 },
            { id: '12', title: '被拦截', url: 'https://blocked.com/a', parentId: '1', dateAdded: 3000 },
            { id: '13', title: '重复甲', url: 'https://dup.com/p?utm_source=x', parentId: '1', dateAdded: 4000 },
            { id: '14', title: '重复乙', url: 'https://dup.com/p', parentId: '1', dateAdded: 5000 },
            { id: '15', title: '空文件夹', parentId: '1', children: [] },
          ],
        },
      ],
    },
  ];
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    const status = url.includes('dead.com') ? 404 : url.includes('blocked.com') ? 403 : 200;
    return { status, url } as Response;
  }) as unknown as typeof fetch;
}

function options(fetchImpl: typeof fetch, extra: Partial<ScanOptions> = {}): ScanOptions {
  return {
    concurrency: 2,
    timeoutMs: 1000,
    hostDelayMs: 0,
    cacheDays: 7,
    ignoreWww: true,
    titleThreshold: 0.86,
    force: false,
    onProgress: () => {},
    fetchImpl,
    ...extra,
  };
}

describe('runScan', () => {
  it('产出死链/拦截/重复/空文件夹报告并正确分类', async () => {
    setBackend(createDemoBackend(seed()));
    const fetchImpl = mockFetch();
    const report = await runScan(options(fetchImpl));

    expect(report.total).toBe(5);
    expect(report.checked).toBe(5);
    expect(report.finishedAt).toBeGreaterThan(0);
    expect(report.cancelled).toBe(false);
    expect(report.deadLinks.map((item) => item.bookmark.id)).toEqual(['11']);
    expect(report.blocked.map((item) => item.bookmark.id)).toEqual(['12']);
    expect(report.errors).toEqual([]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].items.map((item) => item.id).sort()).toEqual(['13', '14']);
    expect(report.emptyFolders.map((folder) => folder.id)).toEqual(['15']);
  });

  it('缓存命中时第二次扫描不再发请求', async () => {
    setBackend(createDemoBackend(seed()));
    const fetchImpl = mockFetch();
    await runScan(options(fetchImpl));
    const firstCalls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await runScan(options(fetchImpl));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(firstCalls);
  });

  it('force 忽略缓存重新检测', async () => {
    setBackend(createDemoBackend(seed()));
    const fetchImpl = mockFetch();
    await runScan(options(fetchImpl));
    const callsBefore = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await runScan(options(fetchImpl, { force: true }));
    const callsAfter = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfter - callsBefore).toBe(5);
  });

  it('取消后保留进度并标记 cancelled', async () => {
    setBackend(createDemoBackend(seed()));
    const controller = new AbortController();
    controller.abort();
    const report = await runScan(options(mockFetch(), { signal: controller.signal, concurrency: 1 }));
    expect(report.cancelled).toBe(true);
    expect(report.checked).toBe(0);
    expect(report.finishedAt).toBeUndefined();
    expect(await loadReport(report.id)).toBeDefined();
  });

  it('中断后可从报告续扫至完成', async () => {
    setBackend(createDemoBackend(seed()));
    const controller = new AbortController();
    let calls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      calls += 1;
      if (calls === 2) controller.abort();
      const status = url.includes('dead.com') ? 404 : url.includes('blocked.com') ? 403 : 200;
      return { status, url } as Response;
    }) as unknown as typeof fetch;

    const partial = await runScan(options(fetchImpl, { signal: controller.signal, concurrency: 1 }));
    expect(partial.cancelled).toBe(true);
    expect(partial.checked).toBeLessThan(5);

    const resumed = await runScan(options(mockFetch(), { reportId: partial.id, concurrency: 1 }));
    expect(resumed.id).toBe(partial.id);
    expect(resumed.cancelled).toBe(false);
    expect(resumed.checked).toBe(5);
    expect(resumed.deadLinks.map((item) => item.bookmark.id)).toEqual(['11']);
  });

  it('报告按时间倒序持久化', async () => {
    setBackend(createDemoBackend(seed()));
    // 用假时钟保证 startedAt 严格递增，不依赖真实计时器粒度
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      const first = await runScan(options(mockFetch()));
      vi.setSystemTime(1_700_000_000_000 + 60_000);
      const second = await runScan(options(mockFetch()));
      const reports = await listReports();
      expect(reports).toHaveLength(2);
      expect(reports[0].id).toBe(second.id);
      expect(reports[1].id).toBe(first.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('扫描过程持续回调进度', async () => {
    setBackend(createDemoBackend(seed()));
    const onProgress = vi.fn();
    await runScan(options(mockFetch(), { onProgress }));
    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(last.checked).toBe(5);
  });
});
describe('续扫 checkedIds 持久化（v2 R4.4）', () => {
  it('续扫时已检测项（含 ok）不再重复请求，checked 单调不回退', async () => {
    setBackend(createDemoBackend(seed()));
    const controller = new AbortController();
    // 并发 1：第一条 fetch 完成后立即取消，保证 checked=1 的确定性
    const fetchImpl = vi.fn(async (url: string) => {
      if (controller.signal.aborted) return { status: 200, url } as Response;
      const status = url.includes('dead.com') ? 404 : url.includes('blocked.com') ? 403 : 200;
      if (!controller.signal.aborted) controller.abort();
      return { status, url } as Response;
    }) as unknown as typeof fetch;
    const report1 = await runScan(options(fetchImpl, { concurrency: 1, signal: controller.signal }));
    expect(report1.cancelled).toBe(true);
    expect(report1.checked).toBe(1);

    const fetchCalls = fetchImpl as unknown as { mock: { calls: unknown[] } };
    const callsBefore = fetchCalls.mock.calls.length;
    const report2 = await runScan(options(fetchImpl, { reportId: report1.id }));
    expect(report2.cancelled).toBe(false);
    expect(fetchCalls.mock.calls.length - callsBefore).toBe(report2.total - report1.checked);
    expect(report2.checked).toBe(report2.total);
    expect(report2.checkedIds).toHaveLength(report2.total);
  });
});
