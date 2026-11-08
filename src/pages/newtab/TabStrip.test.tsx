import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend } from '@/core/backend';
import { collectFolders, flattenTree } from '@/core/bookmarks';
import { SETTINGS_KEY } from '@/core/constants';
import { defaultSettings } from '@/core/settings';
import { store } from '@/core/store';
import type { BookmarkNode, DashboardTab, Settings } from '@/core/types';
import { TabStrip, makeTab } from './TabStrip';

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
            {
              id: 'f2',
              title: '学习',
              parentId: '1',
              children: [{ id: 'b3', title: 'MDN', url: 'https://developer.mozilla.org/', parentId: 'f2', dateAdded: 1700000003000 }],
            },
          ],
        },
      ],
    },
  ];
}

const TABS: DashboardTab[] = [
  { id: 'tab-1', name: '工作', folderIds: ['f1'] },
  { id: 'tab-2', name: '学习', folderIds: ['f2'] },
];

async function seed(over: Partial<Settings['dashboard']> = {}) {
  const tree = seedTree();
  const settings: Settings = {
    ...defaultSettings(),
    dashboard: { ...defaultSettings().dashboard, seeded: true, tabs: TABS, activeTabId: 'tab-1', ...over },
  };
  await getBackend().storageSet(SETTINGS_KEY, settings);
  act(() => {
    store.setState({
      tree,
      folders: collectFolders(tree),
      flat: flattenTree(tree),
      totalCount: 3,
      loading: false,
      settings,
    });
  });
}

function renderStrip() {
  const onAdd = vi.fn();
  const onRename = vi.fn<(tab: DashboardTab) => void>();
  const onDelete = vi.fn<(tab: DashboardTab) => void>();
  render(<TabStrip onAdd={onAdd} onRename={onRename} onDelete={onDelete} />);
  return { onAdd, onRename, onDelete };
}

async function click(node: Element) {
  await act(async () => {
    fireEvent.click(node);
  });
}

const tabNames = () => store.getState().settings.dashboard.tabs.map((tab) => tab.name);

describe('makeTab', () => {
  it('保留名称、文件夹列表为空且 id 带 tab 前缀', () => {
    const tab = makeTab('娱乐');
    expect(tab).toEqual({ id: expect.stringMatching(/^tab_/), name: '娱乐', folderIds: [] });
  });

  it('连续创建的页签 id 互不相同', () => {
    expect(makeTab('甲').id).not.toBe(makeTab('乙').id);
  });
});

describe('TabStrip', () => {
  beforeEach(async () => {
    await seed();
  });

  it('渲染全部页签并只把 activeTabId 标记为选中', () => {
    renderStrip();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tablist', { name: '首页页签' })).toBeInTheDocument();
  });

  it('点击页签把 activeTabId 写入设置', async () => {
    renderStrip();
    await click(screen.getByRole('tab', { name: /学习/ }));

    await waitFor(() => expect(store.getState().settings.dashboard.activeTabId).toBe('tab-2'));
    expect(screen.getByRole('tab', { name: /学习/ })).toHaveAttribute('aria-selected', 'true');
    const persisted = await getBackend().storageGet<Settings>(SETTINGS_KEY);
    expect(persisted?.dashboard.activeTabId).toBe('tab-2');
  });

  it('Enter 与空格键都能激活页签', async () => {
    renderStrip();
    const target = screen.getByRole('tab', { name: /学习/ });
    await act(async () => {
      fireEvent.keyDown(target, { key: 'Enter' });
    });
    await waitFor(() => expect(store.getState().settings.dashboard.activeTabId).toBe('tab-2'));

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('tab', { name: /工作/ }), { key: ' ' });
    });
    await waitFor(() => expect(store.getState().settings.dashboard.activeTabId).toBe('tab-1'));
  });

  it('双击页签触发重命名回调', () => {
    const { onRename } = renderStrip();
    fireEvent.doubleClick(screen.getByRole('tab', { name: /学习/ }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename.mock.calls[0][0]).toMatchObject({ id: 'tab-2', name: '学习' });
  });

  it('选中页签上的铅笔按钮触发重命名且不切换选中项', async () => {
    const { onRename } = renderStrip();
    await click(screen.getByRole('button', { name: '重命名页签 工作' }));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename.mock.calls[0][0].id).toBe('tab-1');
    expect(store.getState().settings.dashboard.activeTabId).toBe('tab-1');
    expect(screen.queryByRole('button', { name: '重命名页签 学习' })).not.toBeInTheDocument();
  });

  it('多页签时选中项显示删除按钮并回调对应页签', async () => {
    const { onDelete } = renderStrip();
    await click(screen.getByRole('button', { name: '删除页签 工作' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0][0]).toMatchObject({ id: 'tab-1', folderIds: ['f1'] });
    expect(store.getState().settings.dashboard.activeTabId).toBe('tab-1');
  });

  it('只有一个页签时不提供删除按钮', async () => {
    await seed({ tabs: [TABS[0]], activeTabId: 'tab-1' });
    renderStrip();

    expect(screen.getByRole('button', { name: '重命名页签 工作' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除页签 工作' })).not.toBeInTheDocument();
  });

  it('拖拽到另一个页签上完成重排并写回设置', async () => {
    renderStrip();
    const source = screen.getByRole('tab', { name: /工作/ });
    const target = screen.getByRole('tab', { name: /学习/ });

    fireEvent.dragStart(source);
    expect(source).toHaveStyle({ opacity: '0.4' });
    fireEvent.dragOver(target);
    await act(async () => {
      fireEvent.drop(target);
    });

    await waitFor(() => expect(tabNames()).toEqual(['学习', '工作']));
    expect(screen.getByRole('tab', { name: /工作/ })).toHaveStyle({ opacity: '1' });
    const persisted = await getBackend().storageGet<Settings>(SETTINGS_KEY);
    expect(persisted?.dashboard.tabs.map((tab) => tab.id)).toEqual(['tab-2', 'tab-1']);
  });

  it('拖到自身时顺序保持不变', async () => {
    renderStrip();
    const source = screen.getByRole('tab', { name: /工作/ });
    fireEvent.dragStart(source);
    fireEvent.dragOver(source);
    await act(async () => {
      fireEvent.drop(source);
    });

    expect(tabNames()).toEqual(['工作', '学习']);
  });

  it('没有 dragstart 时直接 drop 不改动顺序', async () => {
    renderStrip();
    await act(async () => {
      fireEvent.drop(screen.getByRole('tab', { name: /学习/ }));
    });
    expect(tabNames()).toEqual(['工作', '学习']);
  });

  it('拖拽源页签已被移除时 drop 不改动顺序', async () => {
    renderStrip();
    fireEvent.dragStart(screen.getByRole('tab', { name: /工作/ }));
    await act(async () => {
      store.setState({
        settings: {
          ...store.getState().settings,
          dashboard: { ...store.getState().settings.dashboard, tabs: [TABS[1]] },
        },
      });
    });
    await act(async () => {
      fireEvent.drop(screen.getByRole('tab', { name: /学习/ }));
    });
    expect(tabNames()).toEqual(['学习']);
  });

  it('已失效的 folderIds 不计入页签数量', () => {
    renderStrip();
    const tab = screen.getByRole('tab', { name: /工作/ });
    expect(tab).toHaveAttribute('title', '工作 · 1 个文件夹（双击重命名，可拖拽排序）');
    expect(tab).toHaveTextContent('1');
  });

  it('folderIds 全部失效时计数为 0', async () => {
    await seed({ tabs: [{ id: 'tab-1', name: '工作', folderIds: ['gone-1', 'gone-2'] }] });
    renderStrip();
    expect(screen.getByRole('tab', { name: /工作/ })).toHaveAttribute('title', '工作 · 0 个文件夹（双击重命名，可拖拽排序）');
  });

  it('点击新建页签按钮触发 onAdd', async () => {
    const { onAdd } = renderStrip();
    await click(screen.getByRole('button', { name: '新建页签' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('页签数达到 8 个时禁用新建按钮', async () => {
    await seed({
      tabs: Array.from({ length: 8 }, (_, index) => ({ id: `tab-${index}`, name: `页签${index}`, folderIds: [] })),
      activeTabId: 'tab-0',
    });
    const { onAdd } = renderStrip();
    const add = screen.getByRole('button', { name: '新建页签' });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('页签列表为空时只渲染新建按钮', () => {
    renderStrip();
    act(() => {
      store.setState({
        settings: {
          ...store.getState().settings,
          dashboard: { ...store.getState().settings.dashboard, tabs: [], activeTabId: '' },
        },
      });
    });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '新建页签' })).toBeEnabled();
  });
});