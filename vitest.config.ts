import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    // Vitest 5.1 默认 forks 池在 Windows + Node 22 下会丢失 runner 上下文，
    // setupFiles 的 beforeEach 抛 "Vitest failed to find the runner"（39/39 套件失败）。
    // vmThreads 保持文件级隔离且更快，也是 Vitest 输出的性能建议。
    pool: 'vmThreads',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/main.tsx',
        'src/core/types.ts',
        'src/core/fixtures.ts',
      ],
    },
  },
});