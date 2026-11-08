import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// public/theme-boot.js 是三个入口 HTML 在 React 水合前内联执行的首屏主题预设脚本。
// 这里读取源码在受控沙箱中求值，验证镜像/chrome.storage/system/默认 四条读取路径。
const source = readFileSync(resolve(import.meta.dirname, '../../public/theme-boot.js'), 'utf8');

function boot(options: { mirror?: string; storedTheme?: string; prefersLight?: boolean } = {}): string[] {
  const classes = new Set<string>(['dark']);
  const mediaQuery = { matches: options.prefersLight ?? false };
  const classList = {
    remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    add: (...names: string[]) => names.forEach((name) => classes.add(name)),
  };
  const sandbox = {
    localStorage: { getItem: (key: string) => (key === 'sbh:theme' ? options.mirror ?? null : null) },
    document: { documentElement: { classList } },
    window: { matchMedia: () => mediaQuery },
    chrome: {
      storage: {
        local: {
          get: (_keys: string[], callback: (result: Record<string, unknown>) => void) => {
            callback({ 'sbh:settings': options.storedTheme === undefined ? undefined : { theme: options.storedTheme } });
          },
        },
      },
    },
  };
  // 脚本通过 window.chrome 访问扩展 API
  (sandbox.window as { chrome?: unknown }).chrome = sandbox.chrome;
  const run = new Function('localStorage', 'document', 'window', 'chrome', source);
  run(sandbox.localStorage, sandbox.document, sandbox.window, sandbox.chrome);
  return [...classes];
}

describe('theme-boot 首屏主题预设', () => {
  it('优先读同步镜像：light 首屏即 light，不闪深色', () => {
    expect(boot({ mirror: 'light' })).toEqual(['light']);
    expect(boot({ mirror: 'dark', storedTheme: 'light' })).toEqual(['dark']);
  });

  it('无镜像时读 chrome.storage 的设置（首次启动兜底）', () => {
    expect(boot({ storedTheme: 'light' })).toEqual(['light']);
    expect(boot({ storedTheme: 'dark' })).toEqual(['dark']);
  });

  it('system 跟随系统偏好', () => {
    expect(boot({ storedTheme: 'system', prefersLight: true })).toEqual(['light']);
    expect(boot({ storedTheme: 'system', prefersLight: false })).toEqual(['dark']);
  });

  it('镜像与存储全空时回退 dark，不抛错', () => {
    expect(boot({})).toEqual(['dark']);
  });
});
