import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/core/store';
import App from './App';

// 四个子视图各有独立测试文件；这里用轻量桩隔离，聚焦 App 自身的路由/导航/入口逻辑，
// 也避免 BookmarksView 的虚拟列表在 jsdom 中依赖 ResizeObserver
vi.mock('./BookmarksView', () => ({ BookmarksView: () => <div data-testid="view-bookmarks" /> }));
vi.mock('./CleanerView', () => ({ CleanerView: () => <div data-testid="view-cleaner" /> }));
vi.mock('./BackupView', () => ({ BackupView: () => <div data-testid="view-backup" /> }));
vi.mock('./SettingsView', () => ({ SettingsView: () => <div data-testid="view-settings" /> }));

type ChromeStub = { runtime: { sendMessage: ReturnType<typeof vi.fn> } };

function installChromeStub(): ChromeStub {
  const stub: ChromeStub = { runtime: { sendMessage: vi.fn() } };
  (globalThis as { chrome?: unknown }).chrome = stub;
  return stub;
}

async function renderApp() {
  // 预初始化 store，避免组件挂载后 init 的异步 setState 逸出 act
  await act(async () => {
    await store.getState().init();
  });
  await act(async () => {
    render(<App />);
  });
}

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.restoreAllMocks();
});

describe('options/App 视图路由', () => {
  it('缺省 hash 兜底到书签管理视图', async () => {
    await renderApp();
    expect(screen.getByTestId('view-bookmarks')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '书签管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '书签管理' })).toHaveAttribute('aria-current', 'page');
  });

  it('非法 hash 同样兜底到书签管理视图', async () => {
    window.location.hash = '#/不存在的视图';
    await renderApp();
    expect(screen.getByTestId('view-bookmarks')).toBeInTheDocument();
    expect(screen.queryByTestId('view-cleaner')).not.toBeInTheDocument();
  });

  it('合法初始 hash 直接渲染对应视图', async () => {
    window.location.hash = '#settings';
    await renderApp();
    expect(screen.getByTestId('view-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '设置' })).toBeInTheDocument();
  });

  it('hashchange 事件驱动视图切换', async () => {
    await renderApp();
    expect(screen.getByTestId('view-bookmarks')).toBeInTheDocument();

    act(() => {
      window.location.hash = '#cleaner';
      fireEvent(window, new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('view-cleaner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '智能清理' })).toBeInTheDocument();

    act(() => {
      window.location.hash = '#backup';
      fireEvent(window, new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('view-backup')).toBeInTheDocument();
    expect(screen.queryByTestId('view-cleaner')).not.toBeInTheDocument();
  });

  it('hashchange 到非法 hash 时回落书签管理', async () => {
    window.location.hash = '#settings';
    await renderApp();
    act(() => {
      window.location.hash = '#bogus';
      fireEvent(window, new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('view-bookmarks')).toBeInTheDocument();
  });
});

describe('options/App 导航交互', () => {
  it('四个导航项点击后切换视图并同步 hash 与选中态', async () => {
    await renderApp();
    const cases = [
      { label: '智能清理', key: 'cleaner' },
      { label: '备份与回收站', key: 'backup' },
      { label: '设置', key: 'settings' },
      { label: '书签管理', key: 'bookmarks' },
    ] as const;
    for (const item of cases) {
      fireEvent.click(screen.getByRole('button', { name: item.label }));
      expect(screen.getByTestId(`view-${item.key}`)).toBeInTheDocument();
      expect(window.location.hash).toBe(`#${item.key}`);
      expect(screen.getByRole('button', { name: item.label })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('button', { name: item.label })).toHaveAttribute('data-active', 'true');
    }
  });

  it('移动端下拉框切换视图', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('切换视图'), { target: { value: 'backup' } });
    expect(screen.getByTestId('view-backup')).toBeInTheDocument();
    expect(window.location.hash).toBe('#backup');
  });

  it('侧边栏展示书签与文件夹计数', async () => {
    await renderApp();
    const { totalCount, folders } = store.getState();
    expect(totalCount).toBeGreaterThan(0);
    expect(screen.getByText(`${totalCount} 条书签`)).toBeInTheDocument();
    expect(screen.getByText(`${folders.length} 文件夹`)).toBeInTheDocument();
  });

  it('演示模式横幅可见，退出演示模式后消失', async () => {
    await renderApp();
    expect(screen.getByText(/网页预览模式/)).toBeInTheDocument();
    act(() => {
      store.setState({ demo: false });
    });
    expect(screen.queryByText(/网页预览模式/)).not.toBeInTheDocument();
  });
});

describe('options/App 打开首页入口', () => {
  it('有 chrome.runtime 时通过消息打开首页（当前直调行为，R6 将收敛到 Backend）', async () => {
    const stub = installChromeStub();
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: /打开书签首页/ }));
    expect(stub.runtime.sendMessage).toHaveBeenCalledWith({ type: 'sbh:open-hub', focusSearch: false });

    fireEvent.click(screen.getByRole('button', { name: /全局搜索/ }));
    expect(stub.runtime.sendMessage).toHaveBeenCalledWith({ type: 'sbh:open-hub', focusSearch: true });
    expect(stub.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('无 chrome.runtime 时回退 window.open 打开 newtab 页面', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: /打开书签首页/ }));
    expect(open).toHaveBeenCalledWith('newtab.html', '_blank', 'noopener,noreferrer');

    fireEvent.click(screen.getByRole('button', { name: /全局搜索/ }));
    expect(open).toHaveBeenCalledWith('newtab.html#search', '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenCalledTimes(2);
  });
});