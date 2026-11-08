import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setBackend } from '@/core/backend';
import { createDemoBackend } from '@/core/demoBackend';
import { resetCacheForTests } from '@/core/cache';
import { teardownStore } from '@/core/store';

beforeEach(() => {
  setBackend(createDemoBackend());
  resetCacheForTests();
  teardownStore();
  globalThis.localStorage?.clear();
});