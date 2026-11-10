import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend } from '@/core/backend';
import { demoOpened } from '@/core/demoBackend';
import { store } from '@/core/store';
import { buildEntries } from '@/core/search';
import { flattenTree } from '@/core/bookmarks';
import App from './App';

beforeEach(() => {
  window.open = vi.fn();
  const tree = [
    {
      id: '0',
      title: '根',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [
            { id: 'b1', title: '知乎', url: 'https://www.zhihu.com/', parentId: '1', dateAdded: Date.now() },
            { id: 'b2', title: '掘金', url: 'https://juejin.cn/', parentId: '1', dateAdded: Date.now() - 1000 },
          ],
        },
      ],
    },
  ];
  const flat = flattenTree(tree);
  return buildEntries(flat, {}).then((entries) => {
    store.setState({ tree, flat, entries, totalCount: flat.length, loading: false });
  });
});

describe('popup App', () => {
  it('挂载后自动聚焦搜索框', async () => {
    await act(async () => {
      render(<App />);
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '全局搜索' })).toHaveFocus());
  });

  it('渲染三个入口按钮与底部快捷键提示', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByRole('button', { name: /收藏当前页/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /管理台/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开书签首页/ })).toBeInTheDocument();
    expect(screen.getByText(/Enter 新标签页打开/)).toBeInTheDocument();
  });

  it('展示最近添加的书签并按时间倒序', async () => {
    await act(async () => {
      render(<App />);
    });
    // init 会用 DemoBackend 夹具覆盖 store，这里在其完成后重新注入
    await act(async () => {
      store.setState({
        flat: [
          { id: 'b1', title: '知乎', url: 'https://www.zhihu.com/', parentId: '1', folderPath: ['书签栏'], dateAdded: Date.now() },
          { id: 'b2', title: '掘金', url: 'https://juejin.cn/', parentId: '1', folderPath: ['书签栏'], dateAdded: Date.now() - 1000 },
        ],
        loading: false,
      });
    });
    const rows = screen.getAllByText(/zhihu\.com|juejin\.cn/);
    expect(rows[0].textContent).toContain('zhihu.com');
    expect(rows[1].textContent).toContain('juejin.cn');
  });

  it('搜索书签优先于兜底项出现', async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
      render(<App />);
    });
      const input = screen.getByRole('combobox', { name: '全局搜索' });
      fireEvent.change(input, { target: { value: '知' } });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
      expect(options[0].textContent).toContain('知乎');
      expect(options[options.length - 1].textContent).toContain('默认搜索引擎');
    } finally {
      vi.useRealTimers();
    }
  });

  it('收藏当前页写入书签并弹出可撤销提示', async () => {
    await act(async () => {
      render(<App />);
    });
    fireEvent.click(screen.getByRole('button', { name: /收藏当前页/ }));

    await waitFor(() => expect(screen.getByText('已收藏到书签栏')).toBeInTheDocument());
    expect(store.getState().flat.some((item) => item.url === 'https://developer.chrome.com/docs/extensions')).toBe(true);
    const button = screen.getByRole('button', { name: '撤销' });
    fireEvent.click(button);
    await waitFor(() =>
      expect(store.getState().flat.every((item) => item.url !== 'https://developer.chrome.com/docs/extensions')).toBe(true),
    );
  });

  it('最近添加的书签点击后在新标签页打开', async () => {
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      store.setState({
        flat: [
          { id: 'b1', title: '知乎', url: 'https://www.zhihu.com/', parentId: '1', folderPath: ['书签栏'], dateAdded: Date.now() },
        ],
        loading: false,
      });
    });
    demoOpened.length = 0;
    fireEvent.click(screen.getByText('zhihu.com'));
    await waitFor(() =>
      expect(demoOpened).toEqual([{ url: 'https://www.zhihu.com/', disposition: 'newTab' }]),
    );
  });

  it('打开书签首页与打开管理台分别打开对应页面', async () => {
    await act(async () => {
      render(<App />);
    });
    fireEvent.click(screen.getByRole('button', { name: /打开书签首页/ }));
    expect(window.open).toHaveBeenCalledWith('newtab.html', '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: /管理台/ }));
    expect(window.open).toHaveBeenCalledWith('options.html', '_blank', 'noopener,noreferrer');
    expect(getBackend().kind).toBe('demo');
  });
});
