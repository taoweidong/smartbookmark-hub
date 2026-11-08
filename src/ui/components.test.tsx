import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FolderOpen } from 'lucide-react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlatBookmark, SearchEntry, SearchResult } from '@/core/types';
import { store } from '@/core/store';
import { getBackend } from '@/core/backend';
import { SearchBox } from './components/SearchBox';
import { ResultList } from './components/ResultList';
import { BookmarkCard } from './components/BookmarkCard';
import { TagEditor } from './components/TagEditor';
import { FolderPicker } from './components/FolderPicker';
import { ThemeToggle } from './components/ThemeToggle';
import { Modal, ConfirmDialog } from './components/Modal';
import { EmptyState, Progress, StatTile } from './components/Feedback';
import { useSearch, type SearchController } from './hooks/useSearch';
import type { FolderInfo } from '@/core/bookmarks';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.open = vi.fn();
});

function entry(over: Partial<SearchEntry>): SearchEntry {
  return {
    id: 'b1',
    title: '知乎',
    url: 'https://www.zhihu.com/',
    parentId: '1',
    folderPath: ['书签栏'],
    dateAdded: Date.now(),
    host: 'zhihu.com',
    canonicalUrl: 'https://zhihu.com/',
    titleLower: '知乎',
    urlLower: 'https://www.zhihu.com/',
    initials: 'zh',
    pinyinFull: 'zhihu',
    tags: [],
    folderLower: '书签栏',
    tagLowers: [],
    ...over,
  };
}

function result(over: Partial<SearchResult>): SearchResult {
  return {
    kind: 'bookmark',
    id: 'b1',
    title: '知乎',
    url: 'https://www.zhihu.com/',
    subtitle: '书签栏 / zhihu.com',
    score: 100,
    matchedOn: '标题',
    ...over,
  };
}

function folder(over: Partial<FolderInfo>): FolderInfo {
  return {
    id: 'f1',
    title: '工作',
    depth: 1,
    path: ['书签栏', '工作'],
    directCount: 3,
    totalCount: 5,
    special: false,
    ...over,
  };
}

describe('TagEditor', () => {
  it('回车添加标签并去空白，重复标签不添加', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagEditor tags={['前端']} onChange={onChange} />);

    const input = screen.getByLabelText('添加标签');
    fireEvent.change(input, { target: { value: ' react ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['前端', 'react']);

    rerender(<TagEditor tags={['前端', 'react']} onChange={onChange} />);
    fireEvent.change(input, { target: { value: '前端' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['前端', 'react']);
  });

  it('点 X 移除标签，空输入退格删除最后一个', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagEditor tags={['a', 'b']} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('移除标签 a'));
    expect(onChange).toHaveBeenLastCalledWith(['b']);

    rerender(<TagEditor tags={['a', 'b']} onChange={onChange} />);
    const input = screen.getByLabelText('添加标签');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });

  it('常用建议只显示未使用的标签', () => {
    render(<TagEditor tags={['前端']} onChange={() => {}} suggestions={['前端', 'react', '设计']} />);
    const suggestionNames = Array.from(
      screen.getByText('常用').parentElement!.querySelectorAll('button'),
    ).map((button) => button.textContent);
    expect(suggestionNames).toEqual(['react', '设计']);
  });
});

describe('FolderPicker', () => {
  const folders = [
    folder({ id: 'f1', title: '工作', path: ['书签栏', '工作'] }),
    folder({ id: 'f2', title: '学习', path: ['书签栏', '学习'] }),
    folder({ id: 'f3', title: '内网', path: ['书签栏', '内网'], special: true }),
  ];

  it('勾选与取消勾选回调选中集合', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FolderPicker folders={folders} selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /工作/ }));
    expect(onChange).toHaveBeenLastCalledWith(['f1']);

    rerender(<FolderPicker folders={folders} selected={['f1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /工作/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('按路径筛选文件夹', () => {
    render(<FolderPicker folders={folders} selected={[]} onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('筛选文件夹'), { target: { value: '学习' } });
    expect(screen.getByRole('checkbox', { name: /学习/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /工作/ })).not.toBeInTheDocument();
  });

  it('推荐按钮选中非特殊且有内容的一级文件夹，全不选清空', () => {
    const onChange = vi.fn();
    render(
      <FolderPicker
        folders={[...folders, folder({ id: 'f4', title: '深层', depth: 2, totalCount: 9 })]}
        selected={['f1']}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /推荐/ }));
    expect(onChange).toHaveBeenLastCalledWith(['f1', 'f2']);

    fireEvent.click(screen.getByRole('button', { name: '全不选' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe('ThemeToggle', () => {
  it('点击按 深色 → 浅色 → 跟随系统 循环并持久化', async () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText(/墨色（深色）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(store.getState().settings.theme).toBe('light'));
    expect(screen.getByLabelText(/宣纸（浅色）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(store.getState().settings.theme).toBe('system'));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(store.getState().settings.theme).toBe('dark'));
  });
});

describe('Modal / ConfirmDialog', () => {
  it('Esc 与点击遮罩都会关闭', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="对话框" onClose={onClose}>
        <p>内容</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ConfirmDialog 确认执行回调，取消不执行', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        request={{ title: '删除 1 项', danger: true, confirmLabel: '确认删除', onConfirm }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog
        request={{ title: '删除 1 项', danger: true, confirmLabel: '确认删除', onConfirm }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Feedback 组件', () => {
  it('Progress 显示百分比与 aria 值', () => {
    render(<Progress value={25} max={100} label="正在检测" />);
    expect(screen.getByText('25 / 100 · 25%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('Progress max 为 0 时不产生 NaN', () => {
    render(<Progress value={0} max={0} label="空" />);
    expect(screen.getByText('0 / 0 · 0%')).toBeInTheDocument();
  });

  it('EmptyState 渲染引导与动作按钮', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={<FolderOpen size={20} />}
        title="还没有选择文件夹"
        description="先勾选一个文件夹。"
        action={
          <button type="button" onClick={onClick}>
            选择文件夹
          </button>
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择文件夹' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('StatTile 大数字缩写显示', () => {
    render(<StatTile label="书签总数" value={1234} />);
    expect(screen.getByText('1.2k')).toBeInTheDocument();
  });
});

describe('ResultList', () => {
  it('按 书签 → 历史 → 网页 分组展示，点击回调结果', () => {
    const onPick = vi.fn();
    const onHover = vi.fn();
    const results = [
      result({}),
      result({ kind: 'history', id: 'h1', title: '知乎热榜', score: 30, matchedOn: '历史 · 标题' }),
      result({ kind: 'web', id: 'web', title: '在默认搜索引擎中搜索“知乎”', score: -1 }),
    ];
    render(<ResultList results={results} query="知乎" activeIndex={0} onHover={onHover} onPick={onPick} />);

    const headers = screen.getAllByText(/^(收藏夹|历史记录|网页搜索)$/).map((node) => node.textContent);
    expect(headers).toEqual(['收藏夹', '历史记录', '网页搜索']);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(document.querySelector('mark')?.textContent).toBe('知乎');

    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onPick).toHaveBeenCalledWith(results[1], false);
    fireEvent.mouseEnter(screen.getAllByRole('option')[2]);
    expect(onHover).toHaveBeenCalledWith(2);
  });

  it('active 项带 data-active 标记', () => {
    render(
      <ResultList results={[result({}), result({ id: 'b2', title: '掘金' })]} query="" activeIndex={1} onHover={() => {}} onPick={() => {}} />,
    );
    const active = document.querySelector('[data-active="true"]');
    expect(active?.textContent).toContain('掘金');
  });
});

describe('BookmarkCard', () => {
  const bookmark: FlatBookmark = {
    id: 'b1',
    title: '知乎',
    url: 'https://www.zhihu.com/',
    parentId: '1',
    folderPath: ['书签栏'],
    dateAdded: Date.now(),
  };

  it('渲染标题、网址与健康状态点', () => {
    render(<BookmarkCard bookmark={bookmark} hue="#f2b33d" status="dead" onOpen={() => {}} />);
    expect(screen.getByLabelText('打开 知乎')).toBeInTheDocument();
    expect(screen.getByText('zhihu.com')).toBeInTheDocument();
    expect(screen.getByLabelText('链接失效')).toBeInTheDocument();
  });

  it('普通点击打开当前标签，Ctrl 点击新标签', () => {
    const onOpen = vi.fn();
    const { container } = render(<BookmarkCard bookmark={bookmark} hue="#f2b33d" onOpen={onOpen} />);
    const card = screen.getByLabelText('打开 知乎');

    fireEvent.click(card, { ctrlKey: false });
    expect(onOpen).toHaveBeenLastCalledWith(bookmark, false);
    fireEvent.click(card, { ctrlKey: true });
    expect(onOpen).toHaveBeenLastCalledWith(bookmark, true);

    // 新标签按钮不触发卡片自身的 onOpen
    fireEvent.click(screen.getByLabelText('在新标签页打开 知乎'));
    expect(onOpen).toHaveBeenLastCalledWith(bookmark, true);
    expect(container).toBeTruthy();
  });

  it('编辑、删除与选择回调', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <BookmarkCard bookmark={bookmark} hue="#f2b33d" tags={['前端']} selectable selected onOpen={() => {}} onEdit={onEdit} onDelete={onDelete} onSelect={onSelect} />,
    );

    expect(screen.getByText('前端')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('编辑 知乎'));
    expect(onEdit).toHaveBeenCalledWith(bookmark);
    fireEvent.click(screen.getByLabelText('删除 知乎'));
    expect(onDelete).toHaveBeenCalledWith(bookmark);
    fireEvent.click(screen.getByLabelText('选择 知乎'));
    expect(onSelect).toHaveBeenCalledWith('b1', true);
  });

  it('键盘 Enter 打开', () => {
    const onOpen = vi.fn();
    render(<BookmarkCard bookmark={bookmark} hue="#f2b33d" onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByLabelText('打开 知乎'), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(bookmark, false);
  });
});

describe('SearchBox + useSearch', () => {
  function Harness({ initialQuery = '' }: { initialQuery?: string }) {
    const search: SearchController = useSearch(initialQuery);
    return (
      <>
        <SearchBox controller={search} />
        <output data-testid="active">{search.activeIndex}</output>
        <output data-testid="open">{String(search.open)}</output>
      </>
    );
  }

  const seedEntries = () => {
    store.setState({
      entries: [
        entry({}),
        entry({ id: 'b2', title: '掘金', url: 'https://juejin.cn/', titleLower: '掘金', urlLower: 'https://juejin.cn/', initials: 'jj', pinyinFull: 'juejin', canonicalUrl: 'https://juejin.cn/', host: 'juejin.cn' }),
      ],
    });
  };

  it('输入防抖 300ms 后才出结果', async () => {
    vi.useFakeTimers();
    try {
      seedEntries();
      render(<Harness />);
      const input = screen.getByRole('combobox', { name: '全局搜索' });

      fireEvent.change(input, { target: { value: '知乎' } });
      expect(store.getState().results).toEqual([]);
      await act(async () => {
        vi.advanceTimersByTime(299);
      });
      expect(store.getState().results).toEqual([]);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(store.getState().results.length).toBeGreaterThan(0);
      expect(screen.getByRole('listbox', { name: '搜索结果' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('空输入立即清空结果，不等待防抖', () => {
    vi.useFakeTimers();
    try {
      seedEntries();
      store.setState({ results: [result({})] });
      render(<Harness />);
      const input = screen.getByRole('combobox', { name: '全局搜索' });
      fireEvent.change(input, { target: { value: '知乎' } });
      fireEvent.change(input, { target: { value: '   ' } });
      expect(store.getState().query).toBe('   ');
      expect(store.getState().results).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('↑↓ 循环移动选中项，Enter 调用 openUrl，Esc 关闭面板', async () => {
    vi.useFakeTimers();
    try {
      seedEntries();
      const openUrl = vi.spyOn(getBackend(), 'openUrl').mockResolvedValue(undefined);
      render(<Harness />);
      const input = screen.getByRole('combobox', { name: '全局搜索' });

      fireEvent.change(input, { target: { value: '知' } });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      // 书签 2 条 + 网页兜底 1 条
      expect(store.getState().results).toHaveLength(3);

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByTestId('active').textContent).toBe('2');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByTestId('active').textContent).toBe('0');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByTestId('active').textContent).toBe('2');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByTestId('active').textContent).toBe('1');

      fireEvent.keyDown(input, { key: 'Enter' });
      await act(async () => {});
      expect(openUrl).toHaveBeenCalledWith(store.getState().results[1].url, 'current');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.getByTestId('open').textContent).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('初始查询词立即检索并打开面板', async () => {
    vi.useFakeTimers();
    try {
      seedEntries();
      render(<Harness initialQuery="知乎" />);
      await act(async () => {});
      expect(store.getState().query).toBe('知乎');
      expect(screen.getByTestId('open').textContent).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});
