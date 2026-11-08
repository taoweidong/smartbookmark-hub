import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { store } from '@/core/store';
import { collectFolders } from '@/core/bookmarks';
import { defaultSettings } from '@/core/settings';
import type { BookmarkNode } from '@/core/types';
import { BackgroundLayer } from './BackgroundLayer';
import { Dashboard } from './Dashboard';

function seedTree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '根',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [
            {
              id: 'f1',
              title: '工作',
              parentId: '1',
              children: [
                { id: 'b1', title: '项目看板', url: 'https://kanban.example.com/', parentId: 'f1', dateAdded: 1700000001000 },
                { id: 'b2', title: '周报文档', url: 'https://docs.example.com/', parentId: 'f1', dateAdded: 1700000002000 },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function seedStore(over: { folderIds?: string[]; perFolder?: number } = {}) {
  const tree = seedTree();
  store.setState({
    tree,
    folders: collectFolders(tree),
    flat: [
      { id: 'b1', title: '项目看板', url: 'https://kanban.example.com/', parentId: 'f1', folderPath: ['书签栏', '工作'], dateAdded: 1700000001000 },
      { id: 'b2', title: '周报文档', url: 'https://docs.example.com/', parentId: 'f1', folderPath: ['书签栏', '工作'], dateAdded: 1700000002000 },
    ],
    totalCount: 2,
    loading: false,
    error: null,
    settings: {
      ...defaultSettings(),
      dashboard: {
        ...defaultSettings().dashboard,
        perFolder: over.perFolder ?? 8,
        tabs: [{ id: 'tab-default', name: '常用', folderIds: over.folderIds ?? [] }],
        activeTabId: 'tab-default',
      },
    },
  });
}

describe('Dashboard', () => {
  it('未选文件夹时渲染引导和选择按钮', () => {
    seedStore();
    const onPickFolders = vi.fn();
    render(<Dashboard folderIds={[]} health={new Map()} onPickFolders={onPickFolders} onEdit={() => {}} />);

    expect(screen.getByText('这个页签还没有选择文件夹')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /选择文件夹/ }));
    expect(onPickFolders).toHaveBeenCalledTimes(1);
  });

  it('loading 时渲染骨架屏', () => {
    seedStore();
    store.setState({ loading: true });
    render(<Dashboard folderIds={['f1']} health={new Map()} onPickFolders={() => {}} onEdit={() => {}} />);
    expect(screen.queryByText('工作')).not.toBeInTheDocument();
    expect(document.querySelector('.skeleton')).not.toBeNull();
  });

  it('勾选文件夹后按分区渲染卡片', () => {
    seedStore({ folderIds: ['f1'] });
    render(<Dashboard folderIds={['f1']} health={new Map()} onPickFolders={() => {}} onEdit={() => {}} />);

    expect(screen.getByRole('heading', { name: '工作' })).toBeInTheDocument();
    expect(screen.getByLabelText('打开 项目看板')).toBeInTheDocument();
    expect(screen.getByLabelText('打开 周报文档')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /批量打开/ })).toBeInTheDocument();
  });

  it('超过每组上限时折叠，点击展开全部', () => {
    seedStore({ folderIds: ['f1'], perFolder: 1 });
    render(<Dashboard folderIds={['f1']} health={new Map()} onPickFolders={() => {}} onEdit={() => {}} />);

    expect(screen.getByLabelText('打开 项目看板')).toBeInTheDocument();
    expect(screen.queryByLabelText('打开 周报文档')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /显示全部 2 条/ }));
    expect(screen.getByLabelText('打开 周报文档')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /收起/ })).toBeInTheDocument();
  });

  it('选中的文件夹被移除后不渲染对应分区', () => {
    seedStore({ folderIds: ['f1'] });
    render(<Dashboard folderIds={['f-missing']} health={new Map()} onPickFolders={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('这个页签还没有选择文件夹')).toBeInTheDocument();
  });
});

describe('makeTab', () => {
  it('创建带空文件夹列表的新页签', async () => {
    const { makeTab } = await import('./TabStrip');
    const tab = makeTab('娱乐');
    expect(tab.name).toBe('娱乐');
    expect(tab.folderIds).toEqual([]);
    expect(tab.id).toMatch(/^tab_/);
  });
});

describe('BackgroundLayer', () => {
  it('solid 背景渲染自定义颜色，未选颜色时不渲染', () => {
    const base = defaultSettings();
    act(() => {
      store.setState({ settings: { ...base, dashboard: { ...base.dashboard, background: { type: 'solid', value: '#223355' } } } });
    });
    const { rerender } = render(<BackgroundLayer />);
    const layer = document.querySelector('div.fixed.inset-0.z-0') as HTMLElement | null;
    expect(layer?.style.background).toContain('rgb(34, 51, 85)'); // #223355

    act(() => {
      store.setState({ settings: { ...base, dashboard: { ...base.dashboard, background: { type: 'solid', value: '' } } } });
    });
    rerender(<BackgroundLayer />);
    expect(document.querySelector('div.fixed.inset-0.z-0')).toBeNull();
  });

  it('aurora 背景渲染极光层', () => {
    const base = defaultSettings();
    store.setState({ settings: { ...base, dashboard: { ...base.dashboard, background: { type: 'aurora', value: '' } } } });
    render(<BackgroundLayer />);
    expect(document.querySelector('.aurora-layer')).not.toBeNull();
  });
});
