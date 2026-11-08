import { describe, expect, it } from 'vitest';
import { runPool } from './pool';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('runPool', () => {
  it('同时在飞的任务数不超过 size，且结果顺序与输入一致', async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, gate);
    const run = runPool(
      [0, 1, 2, 3, 4, 5],
      2,
      async (index) => {
        active += 1;
        peak = Math.max(peak, active);
        await gates[index].promise;
        active -= 1;
        return index * 2;
      },
    );
    expect(peak).toBe(2);
    gates.forEach((g) => g.resolve());
    expect(await run).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('onProgress 调用次数等于任务数', async () => {
    const calls: [number, number][] = [];
    await runPool([1, 2, 3, 4], 3, async (n) => n, {
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toHaveLength(4);
    expect(calls.every(([, total]) => total === 4)).toBe(true);
    expect(calls.map(([done]) => done).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('abort 后不再启动新任务', async () => {
    const controller = new AbortController();
    let processed = 0;
    await runPool(
      [1, 2, 3, 4, 5, 6],
      1,
      async (n) => {
        processed += 1;
        if (processed === 2) controller.abort();
        return n;
      },
      { signal: controller.signal },
    );
    expect(processed).toBe(2);
  });

  it('空输入立即返回空数组', async () => {
    expect(await runPool([], 5, async (n: number) => n)).toEqual([]);
  });

  it('size 大于任务数时不会越界', async () => {
    expect(await runPool([1, 2], 10, async (n) => n + 1)).toEqual([2, 3]);
  });
});