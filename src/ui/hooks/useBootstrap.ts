import { useEffect } from 'react';
import { store, useApp } from '@/core/store';
import { applyTheme, watchSystemTheme } from '../theme';

export function useBootstrap(): void {
  const theme = useApp((state) => state.settings.theme);
  const accent = useApp((state) => state.settings.accent);

  useEffect(() => {
    void store.getState().init();
  }, []);

  useEffect(() => {
    applyTheme(theme, accent);
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyTheme(theme, accent));
  }, [theme, accent]);
}