import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setBackend } from '@/core/backend';
import { createDemoBackend, demoOpened } from '@/core/demoBackend';
import { resetCacheForTests } from '@/core/cache';
import { teardownStore } from '@/core/store';
import { resetLayers } from '@/ui/popupStack';

// jsdom 未实现这些 API，统一补桩
Element.prototype.scrollIntoView ??= () => {};
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
};

// blob URL 在 jsdom 中不可用；补桩后下载延迟 revoke 的定时器也不会触发未实现告警
URL.createObjectURL = () => 'blob:mock';
URL.revokeObjectURL = () => {};

// 带 download 的 anchor 点击是下载而非导航，避免 jsdom 抛 "Not implemented: navigation"
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
  if (this.hasAttribute('download')) return;
  nativeAnchorClick.call(this);
};

beforeEach(() => {
  setBackend(createDemoBackend());
  resetCacheForTests();
  teardownStore();
  // 模块级单例：不清会让断言其内容的用例变成顺序相关
  demoOpened.length = 0;
  resetLayers();
  globalThis.localStorage?.clear();
});