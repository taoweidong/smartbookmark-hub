import { beforeEach, describe, expect, it } from 'vitest';
import { CACHE_PREFIX, cache, resetCacheForTests } from './cache';

// jsdom 无 indexedDB，cache 自动落入内存实现，恰好覆盖降级路径
describe('cache（内存模式）', () => {
  beforeEach(() => {
    resetCacheForTests();
  });

  it('set/get 往返，缺失键返回 undefined', async () => {
    await cache.set('a', { x: 1 });
    expect(await cache.get<{ x: number }>('a')).toEqual({ x: 1 });
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('del 删除后不可读', async () => {
    await cache.set('a', 1);
    await cache.del('a');
    expect(await cache.get('a')).toBeUndefined();
  });

  it('值经 structuredClone 隔离，修改读取结果不影响存储', async () => {
    await cache.set('obj', { list: [1, 2] });
    const first = await cache.get<{ list: number[] }>('obj');
    first!.list.push(3);
    expect(await cache.get('obj')).toEqual({ list: [1, 2] });
  });

  it('entries 按 prefix 过滤并返回键值对', async () => {
    await cache.set('health:a', 1);
    await cache.set('health:b', 2);
    await cache.set('report:c', 3);
    const entries = await cache.entries<number>(CACHE_PREFIX.health);
    expect(entries).toHaveLength(2);
    expect(Object.fromEntries(entries)).toEqual({ 'health:a': 1, 'health:b': 2 });
  });

  it('clear(prefix) 只清空该前缀', async () => {
    await cache.set('health:a', 1);
    await cache.set('report:c', 3);
    await cache.clear(CACHE_PREFIX.health);
    expect(await cache.get('health:a')).toBeUndefined();
    expect(await cache.get('report:c')).toBe(3);
  });

  it('clear() 清空全部', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });

  it('keys 返回全部键并可按前缀过滤', async () => {
    await cache.set('health:a', 1);
    await cache.set('report:c', 3);
    expect(await cache.keys()).toHaveLength(2);
    expect(await cache.keys('health:')).toEqual(['health:a']);
  });

  it('resetCacheForTests 丢弃全部内存数据', async () => {
    await cache.set('a', 1);
    resetCacheForTests();
    expect(await cache.get('a')).toBeUndefined();
  });
});
