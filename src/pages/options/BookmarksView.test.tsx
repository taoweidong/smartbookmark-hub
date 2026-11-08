import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend } from '@/core/backend';
import type { LinkHealth } from '@/core/types';
import { store } from '@/core/store';
import { collectFolders, flattenTree } from '@/core/bookmarks';
import { defaultSettings } from '@/core/settings';
import type { EditorTarget } from '@/ui/components/BookmarkEditor';
import type { ConfirmRequest } from '@/ui/components/Modal';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        start: index * opts.estimateSize(),
        size: opts.estimateSize(),
        key: index,
      })),
    measure: () => {},
    measureElement: () => {},
    scrollToIndex: () => {},
    scrollToOffset: () => {},
  }),
}));

const { BookmarksView } = await import('./BookmarksView');

function seedStore() {
  const tree = [
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
                { id: 'b2', title: '已下线文档', url: 'https://gone.example.com/', parentId: 'f1', dateAdded: 1700000002000 },
              ],
            },
          ],
        },
      ],
    },
  ];
  store.setState({
    tree,
    folders: collectFolders(tree),
    flat: flattenTree(tree),
    totalCount: 2,
    loading: false,
    settings: defaultSettings(),
  });
}

describe('BookmarksView', () => {
  beforeEach(() => {
    seedStore();
  });

  const renderView = (health: Map<string, LinkHealth> = new Map()) => {
    const onEdit = vi.fn<(target: EditorTarget) => void>();
    const requestConfirm = vi.fn<(request: ConfirmRequest) => void>();
    render(<BookmarksView health={health} onEdit={onEdit} requestConfirm={requestConfirm} />);
    return { onEdit, requestConfirm };
  };

  it('渲染文件夹树与书签行', () => {
    renderView();
    expect(screen.getByRole('tree', { name: '书签文件夹' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /书签栏/ })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /工作/ })).toBeInTheDocument();
    expect(screen.getByText('项目看板')).toBeInTheDocument();
    expect(screen.getByText('已下线文档')).toBeInTheDocument();
    expect(screen.getByText(/共 2 条/)).toBeInTheDocument();
  });

  it('筛选框按标题过滤行', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('筛选书签'), { target: { value: '看板' } });
    expect(screen.getByText('项目看板')).toBeInTheDocument();
    expect(screen.queryByText('已下线文档')).not.toBeInTheDocument();
  });

  it('按链接状态过滤：只显示已失效', () => {
    const health = new Map<string, LinkHealth>([
      ['https://gone.example.com/', { canonicalUrl: 'https://gone.example.com/', status: 'dead', httpStatus: 404, checkedAt: Date.now() }],
    ]);
    renderView(health);
    fireEvent.change(screen.getByLabelText('链接状态筛选'), { target: { value: 'dead' } });
    expect(screen.getByText('已下线文档')).toBeInTheDocument();
    expect(screen.queryByText('项目看板')).not.toBeInTheDocument();
  });

  it('新建书签触发编辑器，新建文件夹走后端创建', async () => {
    const create = vi.spyOn(getBackend(), 'create');
    const { onEdit } = renderView();

    fireEvent.click(screen.getAllByRole('button', { name: /新建书签/ })[0]);
    expect(onEdit).toHaveBeenCalledWith({ mode: 'create', parentId: '1' });

    fireEvent.click(screen.getByLabelText('新建文件夹'));
    fireEvent.change(screen.getByLabelText('文件夹名称'), { target: { value: '设计参考' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ parentId: '1', title: '设计参考' }));
    await waitFor(() =>
      expect(store.getState().toasts.some((toast) => toast.message === '已新建文件夹')).toBe(true),
    );
  });

  it('全选后批量删除弹出确认框', () => {
    const { requestConfirm } = renderView();
    fireEvent.click(screen.getByRole('button', { name: /全选/ }));
    expect(store.getState().selectedIds).toEqual(['b1', 'b2']);
    expect(screen.getByText('已选 2 项')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(requestConfirm.mock.calls[0][0].title).toBe('删除 2 项');
  });

  it('勾选单个行进入选择集', () => {
    renderView();
    fireEvent.click(screen.getByLabelText('选择 项目看板'));
    expect(store.getState().selectedIds).toEqual(['b1']);
  });
});

describe('选择范围一致性（v2 R5.3）', () => {
  it('切换文件夹后清空选择，移动范围与可见行一致', () => {
    seedStore();
    render(<BookmarksView health={new Map()} onEdit={() => {}} requestConfirm={() => {}} />);

    fireEvent.click(screen.getByLabelText('选择 项目看板'));
    expect(store.getState().selectedIds).toEqual(['b1']);

    fireEvent.click(screen.getByRole('treeitem', { name: /工作/ }));
    expect(store.getState().selectedIds).toEqual([]);
  });
});
