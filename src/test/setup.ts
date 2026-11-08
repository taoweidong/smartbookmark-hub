import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setBackend } from '@/core/backend';
import { createDemoBackend } from '@/core/demoBackend';
import { resetCacheForTests } from '@/core/cache';
import { teardownStore } from '@/core/store';

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

beforeEach(() => {
  setBackend(createDemoBackend());
  resetCacheForTests();
  teardownStore();
  globalThis.localStorage?.clear();
});