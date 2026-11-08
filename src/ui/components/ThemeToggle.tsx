import { Moon, Sun, Monitor } from 'lucide-react';
import { store, useApp } from '@/core/store';
import type { ThemeMode } from '@/core/types';

const ORDER: ThemeMode[] = ['dark', 'light', 'system'];
const META = {
  dark: { Icon: Moon, label: '墨色（深色）' },
  light: { Icon: Sun, label: '宣纸（浅色）' },
  system: { Icon: Monitor, label: '跟随系统' },
} as const;

export function ThemeToggle() {
  const theme = useApp((state) => state.settings.theme);
  const { Icon, label } = META[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      className="icon-btn"
      title={`${label} · 点击切换为${META[next].label}`}
      aria-label={`当前主题：${label}，点击切换`}
      onClick={() => void store.getState().updateSettings({ theme: next })}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}