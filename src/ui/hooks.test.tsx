import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { store } from '@/core/store';
import { CACHE_PREFIX, cache } from '@/core/cache';
import type { LinkHealth } from '@/core/types';
import type { ConfirmRequest } from './components/Modal';
import { useHealth } from './hooks/useHealth';
import { useSafeDelete } from './hooks/useSafeDelete';
import { applyTheme, resolveTheme } from './theme';

describe('useSafeDelete', () => {
  function Harness({ victimId, onRequest }: { victimId: string; onRequest(request: ConfirmRequest): void }) {
    const safe = useSafeDelete(onRequest);
    return (
      <button
        type="button"
        onClick={() => safe([victimId], [{ title: '目标', detail: 'https://victim.example.com/' }], '删除书签')}
      >
        触发删除
      </button>
    );
  }

  it('弹出确认 → 确认后删除入回收站 → 撤销完整恢复', async () => {
    await store.getState().init();
    const victim = store.getState().flat.find((item) => item.url) ?? store.getState().flat[0];

    let captured: ConfirmRequest | null = null;
    render(<Harness victimId={victim.id} onRequest={(request) => (captured = request)} />);
    fireEvent.click(screen.getByRole('button', { name: '触发删除' }));

    expect(captured).not.toBeNull();
    expect(captured!.title).toBe('删除 1 项');
    expect(captured!.danger).toBe(true);

    await act(async () => {
      await captured!.onConfirm();
    });

    expect(store.getState().flat.some((item) => item.id === victim.id)).toBe(false);
    const toast = store.getState().toasts.find((item) => item.message.includes('已删除'));
    expect(toast?.undo).toBeTypeOf('function');

    await act(async () => {
      await toast!.undo!();
    });
    await waitFor(() =>
      expect(store.getState().flat.some((item) => item.id === victim.id || item.url === victim.url)).toBe(true),
    );
  });

  it('空 id 列表不弹确认', () => {
    const requestConfirm = vi.fn();
    function EmptyHarness() {
      const safe = useSafeDelete(requestConfirm);
      return <button type="button" onClick={() => safe([], [], '删除书签')}>空删除</button>;
    }
    render(<EmptyHarness />);
    fireEvent.click(screen.getByRole('button', { name: '空删除' }));
    expect(requestConfirm).not.toHaveBeenCalled();
  });
});

describe('useHealth', () => {
  function Probe({ onReady }: { onReady(value: ReturnType<typeof useHealth>): void }) {
    onReady(useHealth());
    return null;
  }

  it('读取健康缓存并可 reload 刷新', async () => {
    await cache.set<LinkHealth>(CACHE_PREFIX.health + 'https://a.example.com/', {
      canonicalUrl: 'https://a.example.com/',
      status: 'ok',
      checkedAt: 1,
    });
    await cache.set<LinkHealth>(CACHE_PREFIX.health + 'https://b.example.com/', {
      canonicalUrl: 'https://b.example.com/',
      status: 'dead',
      httpStatus: 404,
      checkedAt: 2,
    });

    let latest: ReturnType<typeof useHealth> | null = null;
    render(<Probe onReady={(value) => (latest = value)} />);

    await waitFor(() => expect(latest!.health.size).toBe(2));
    expect(latest!.health.get('https://a.example.com/')?.status).toBe('ok');
    expect(latest!.health.get('https://b.example.com/')?.httpStatus).toBe(404);

    await cache.set<LinkHealth>(CACHE_PREFIX.health + 'https://c.example.com/', {
      canonicalUrl: 'https://c.example.com/',
      status: 'error',
      checkedAt: 3,
    });
    act(() => {
      latest!.reload();
    });
    await waitFor(() => expect(latest!.health.size).toBe(3));
  });
});

describe('theme', () => {
  it('applyTheme 写入主题类与强调色', () => {
    applyTheme('light', 'azure');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.accent).toBe('azure');

    applyTheme('dark', 'gilt');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.dataset.accent).toBe('gilt');
  });

  it('system 模式在无 matchMedia 环境回退为 dark', () => {
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
});
