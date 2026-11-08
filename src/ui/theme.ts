import type { AccentName, ThemeMode } from '@/core/types';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(mode: ThemeMode, accent: AccentName): void {
  const root = document.documentElement;
  root.classList.toggle('light', resolveTheme(mode) === 'light');
  root.classList.toggle('dark', resolveTheme(mode) === 'dark');
  root.dataset.accent = accent;
}

export function watchSystemTheme(callback: () => void): () => void {
  const query = window.matchMedia?.('(prefers-color-scheme: light)');
  if (!query) return () => {};
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}