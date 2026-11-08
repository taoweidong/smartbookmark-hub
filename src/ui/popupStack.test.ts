import { describe, expect, it } from 'vitest';
import { isTopLayer, layerCount, popLayer, pushLayer, resetLayers } from './popupStack';

describe('popupStack', () => {
  it('push 返回严格递增的层 id', () => {
    const first = pushLayer();
    const second = pushLayer();
    const third = pushLayer();
    expect(second).toBe(first + 1);
    expect(third).toBe(second + 1);
    expect(layerCount()).toBe(3);
  });

  it('isTopLayer 仅对栈顶为真', () => {
    const bottom = pushLayer();
    const middle = pushLayer();
    const top = pushLayer();
    expect(isTopLayer(top)).toBe(true);
    expect(isTopLayer(middle)).toBe(false);
    expect(isTopLayer(bottom)).toBe(false);
  });

  it('popLayer 支持乱序移除中间层', () => {
    const bottom = pushLayer();
    const middle = pushLayer();
    const top = pushLayer();
    popLayer(middle);
    expect(layerCount()).toBe(2);
    expect(isTopLayer(top)).toBe(true);
    expect(isTopLayer(middle)).toBe(false);
    popLayer(bottom);
    expect(layerCount()).toBe(1);
    expect(isTopLayer(top)).toBe(true);
  });

  it('弹出栈顶后下一层成为栈顶', () => {
    pushLayer();
    const second = pushLayer();
    const top = pushLayer();
    popLayer(top);
    expect(isTopLayer(second)).toBe(true);
  });

  it('重复 pop 同一层是幂等的', () => {
    const id = pushLayer();
    pushLayer();
    popLayer(id);
    popLayer(id);
    popLayer(id);
    expect(layerCount()).toBe(1);
  });

  it('pop 不存在的 id 不影响栈', () => {
    const id = pushLayer();
    popLayer(id + 9999);
    expect(layerCount()).toBe(1);
    expect(isTopLayer(id)).toBe(true);
  });

  it('空栈时 isTopLayer 恒为 false', () => {
    resetLayers();
    expect(layerCount()).toBe(0);
    expect(isTopLayer(0)).toBe(false);
    expect(isTopLayer(1)).toBe(false);
    expect(isTopLayer(-1)).toBe(false);
  });

  it('resetLayers 清空全部层且之后仍可正常入栈', () => {
    const before = pushLayer();
    pushLayer();
    pushLayer();
    resetLayers();
    expect(layerCount()).toBe(0);
    expect(isTopLayer(before)).toBe(false);
    const after = pushLayer();
    expect(after).toBeGreaterThan(before);
    expect(layerCount()).toBe(1);
    expect(isTopLayer(after)).toBe(true);
  });

  it('全部弹出后回到空栈状态', () => {
    const a = pushLayer();
    const b = pushLayer();
    popLayer(b);
    popLayer(a);
    expect(layerCount()).toBe(0);
    expect(isTopLayer(a)).toBe(false);
    expect(isTopLayer(b)).toBe(false);
  });
});