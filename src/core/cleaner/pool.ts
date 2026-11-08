export interface PoolOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export async function runPool<T, R>(
  items: T[],
  size: number,
  worker: (item: T, index: number) => Promise<R>,
  opts: PoolOptions = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (!items.length) return results;

  let cursor = 0;
  let done = 0;
  let failed = false;
  const width = Math.max(1, Math.min(Math.floor(size) || 1, items.length));

  const runner = async () => {
    for (;;) {
      // 任一 worker 失败即标记终止：在飞任务结束后不再启动新任务（scan 靠 signal 收尾 I/O）
      if (failed || opts.signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
      done += 1;
      // 进度回调异常不应中断池
      try {
        opts.onProgress?.(done, items.length);
      } catch {
        // 忽略进度回调故障
      }
    }
  };

  await Promise.all(Array.from({ length: width }, runner));
  return results;
}