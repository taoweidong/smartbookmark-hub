import type { AccentName, ThemeMode } from '@/core/types';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(mode: ThemeMode, accent: AccentName): void {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle('light', resolved === 'light');
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.accent = accent;
  // 同步镜像给 theme-boot.js：下次启动在 React 水合前即应用主题，消除首屏闪烁
  try {
    localStorage.setItem('sbh:theme', resolved);
  } catch {
    // 隐私模式等存储不可写场景忽略
  }
}

export function watchSystemTheme(callback: () => void): () => void {
  const query = window.matchMedia?.('(prefers-color-scheme: light)');
  if (!query) return () => {};
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}