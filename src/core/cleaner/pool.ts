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
  const width = Math.max(1, Math.min(Math.floor(size) || 1, items.length));

  const runner = async () => {
    for (;;) {
      if (opts.signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      done += 1;
      opts.onProgress?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: width }, runner));
  return results;
}