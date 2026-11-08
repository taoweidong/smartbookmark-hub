import { describe, expect, it, vi } from 'vitest';
import { checkLink, classifyStatus, type CheckOptions } from './deadLinks';

function response(status: number, url = 'https://example.com/'): Response {
  return { status, url } as Response;
}

function options(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return {
    timeoutMs: 1000,
    hostDelayMs: 250,
    hostClock: new Map(),
    now: () => 0,
    sleep: async () => {},
    ...overrides,
  };
}

describe('classifyStatus', () => {
  it('按规则分类状态码', () => {
    expect(classifyStatus(200)).toBe('ok');
    expect(classifyStatus(301)).toBe('ok');
    expect(classifyStatus(399)).toBe('ok');
    expect(classifyStatus(404)).toBe('dead');
    expect(classifyStatus(410)).toBe('dead');
    expect(classifyStatus(451)).toBe('dead');
    expect(classifyStatus(403)).toBe('blocked');
    expect(classifyStatus(429)).toBe('blocked');
    expect(classifyStatus(503)).toBe('blocked');
    expect(classifyStatus(500)).toBe('error');
    expect(classifyStatus(400)).toBe('error');
  });
});

describe('checkLink', () => {
  it('200 判定 ok', async () => {
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: vi.fn(async () => response(200)) as unknown as typeof fetch }),
    );
    expect(result.status).toBe('ok');
    expect(result.httpStatus).toBe(200);
  });

  it('重定向判定 ok 并记录 finalUrl', async () => {
    const result = await checkLink(
      'https://example.com/a',
      options({
        fetchImpl: vi.fn(async () => response(301, 'https://example.com/b')) as unknown as typeof fetch,
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.finalUrl).toBe('https://example.com/b');
  });

  it.each([404, 410, 451])('%i 判定 dead', async (status) => {
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: vi.fn(async () => response(status)) as unknown as typeof fetch }),
    );
    expect(result.status).toBe('dead');
  });

  it.each([403, 429, 503])('%i 判定 blocked 而非 dead', async (status) => {
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: vi.fn(async () => response(status)) as unknown as typeof fetch }),
    );
    expect(result.status).toBe('blocked');
  });

  it('500 判定 error', async () => {
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: vi.fn(async () => response(500)) as unknown as typeof fetch }),
    );
    expect(result.status).toBe('error');
  });

  it('HEAD 返回 405 时回退 GET', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('HEAD');
    expect((fetchImpl.mock.calls[1][1] as RequestInit).method).toBe('GET');
    expect(result.status).toBe('ok');
  });

  it('HEAD 网络异常时回退 GET', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed'))
      .mockResolvedValueOnce(response(404));
    const result = await checkLink(
      'https://example.com/a',
      options({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('dead');
  });

  it('超时判定 timeout', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    // 用假时钟推进超时，避免依赖真实 20ms 计时（慢机器上会 flaky）
    vi.useFakeTimers();
    try {
      const pending = checkLink('https://example.com/a', options({ timeoutMs: 20, fetchImpl }));
      await vi.advanceTimersByTimeAsync(20);
      expect((await pending).status).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('非 http(s) 链接直接跳过且不发请求', async () => {
    const fetchImpl = vi.fn();
    const result = await checkLink(
      'chrome://settings/',
      options({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('同主机第二次请求按 hostDelayMs 节流', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const hostClock = new Map<string, number>();
    const fetchImpl = vi.fn(async () => response(200)) as unknown as typeof fetch;
    const opts = options({
      fetchImpl,
      hostClock,
      now: () => clock,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    await checkLink('https://example.com/a', opts);
    await checkLink('https://example.com/b', opts);
    expect(sleeps).toEqual([250]);
    expect(clock).toBe(250);

    await checkLink('https://other.com/a', opts);
    expect(sleeps).toEqual([250]);
  });

  it('外部取消时返回 skipped', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const result = await checkLink(
      'https://example.com/a',
      options({ signal: controller.signal, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});