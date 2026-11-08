import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend, setBackend } from '@/core/backend';
import { createDemoBackend } from '@/core/demoBackend';
import { SETTINGS_KEY } from '@/core/constants';
import { defaultSettings } from '@/core/settings';
import { store } from '@/core/store';
import type { BookmarkNode, DashboardTab, Settings } from '@/core/types';
import App from './App';

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

const TABS: DashboardTab[] = [{ id: 'tab-1', name: '工作', folderIds: ['f1'] }];
const TWO_TABS: DashboardTab[] = [...TABS, { id: 'tab-2', name: '学习', folderIds: ['f2'] }];

async function seedSettings(over: Partial<Settings['dashboard']> = {}) {
  const settings: Settings = {
    ...defaultSettings(),
    dashboard: { ...defaultSettings().dashboard, seeded: true, tabs: TABS, activeTabId: 'tab-1', ...over },
  };
  await getBackend().storageSet(SETTINGS_KEY, settings);
}

async function renderApp() {
  await act(async () => {
    render(<App />);
  });
  await waitFor(() => expect(store.getState().loading).toBe(false));
}

async function click(node: Element) {
  await act(async () => {
    fireEvent.click(node);
  });
}

const dashboard = () => store.getState().settings.dashboard;

beforeEach(async () => {
  window.location.hash = '';
  window.open = vi.fn();
  setBackend(createDemoBackend(seedTree()));
  await seedSettings();
});

afterEach(() => {
  window.location.hash = '';
});

describe('newtab App 渲染', () => {
  it('渲染搜索框、页签、显示控制与已选文件夹的书签卡片', async () => {
    await renderApp();

    expect(screen.getByRole('combobox', { name: '全局搜索' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: '首页页签' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /工作/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('背景样式')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '工作' })).toBeInTheDocument();
    expect(screen.getByLabelText('打开 项目看板')).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\/⌘ \+ K 聚焦搜索/)).toBeInTheDocument();
  });

  it('默认展示统计卡片、页签摘要与演示模式提示', async () => {
    await renderApp();

    expect(screen.getByText('书签总数')).toBeInTheDocument();
    expect(screen.getByText('链接健康度')).toBeInTheDocument();
    expect(screen.getByText(/展示 1 个文件夹、2 条书签/)).toBeInTheDocument();
    expect(screen.getByText(/当前是网页预览模式/)).toBeInTheDocument();
  });

  it('store 中存在错误时渲染错误提示', async () => {
    await renderApp();
    act(() => {
      store.setState({ error: '读取书签失败' });
    });
    expect(screen.getByText('读取书签失败')).toBeInTheDocument();
  });

  it('关闭统计开关后隐藏统计卡片', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '统计' }));

    await waitFor(() => expect(screen.queryByText('书签总数')).not.toBeInTheDocument());
    expect(dashboard().showStats).toBe(false);
  });

  it('点击管理台打开扩展设置页', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: /管理台/ }));
    expect(window.open).toHaveBeenCalledWith('options.html', '_blank', 'noopener,noreferrer');
  });
});

describe('newtab App hash intent', () => {
  it('#q= 会解码查询词、自动搜索并聚焦输入框', async () => {
    vi.useFakeTimers();
    try {
      window.location.hash = '#q=%E9%A1%B9%E7%9B%AE';
      await act(async () => {
        render(<App />);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(80);
      });

      const input = screen.getByRole('combobox', { name: '全局搜索' });
      expect(input).toHaveValue('项目');
      expect(input).toHaveFocus();
      expect(store.getState().query).toBe('项目');
      expect(screen.getByRole('listbox', { name: '搜索结果' })).toBeInTheDocument();
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('项目看板');
    } finally {
      vi.useRealTimers();
    }
  });

  it('#search 只聚焦搜索框，不预填查询词', async () => {
    vi.useFakeTimers();
    try {
      window.location.hash = '#search';
      await act(async () => {
        render(<App />);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(80);
      });

      const input = screen.getByRole('combobox', { name: '全局搜索' });
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(store.getState().query).toBe('');
      expect(screen.queryByRole('listbox', { name: '搜索结果' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('没有 hash 时不自动聚焦也不触发搜索', async () => {
    await renderApp();

    const input = screen.getByRole('combobox', { name: '全局搜索' });
    expect(input).toHaveValue('');
    expect(input).not.toHaveFocus();
    expect(store.getState().results).toEqual([]);
  });

  it('无法识别的 hash 按无 intent 处理', async () => {
    window.location.hash = '#unknown';
    await renderApp();

    expect(screen.getByRole('combobox', { name: '全局搜索' })).toHaveValue('');
    expect(store.getState().query).toBe('');
  });

  it('Ctrl+K 与 Ctrl+Shift+F 都能聚焦搜索框', async () => {
    await renderApp();
    const input = screen.getByRole('combobox', { name: '全局搜索' });
    expect(input).not.toHaveFocus();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    expect(input).toHaveFocus();

    input.blur();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    });
    expect(input).toHaveFocus();
  });
});

describe('newtab App 页签管理', () => {
  it('新建页签弹框在名称为空时禁用创建按钮', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '新建页签' }));

    expect(screen.getByRole('dialog', { name: '新建页签' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /创建并选择文件夹/ });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('页签名称'), { target: { value: '   ' } });
    expect(submit).toBeDisabled();
  });

  it('新建页签后自动激活并进入文件夹选择，保存后写回设置与提示', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '新建页签' }));
    fireEvent.change(screen.getByLabelText('页签名称'), { target: { value: '娱乐' } });
    await click(screen.getByRole('button', { name: /创建并选择文件夹/ }));

    await waitFor(() => expect(dashboard().tabs).toHaveLength(2));
    const created = dashboard().tabs[1];
    expect(created.name).toBe('娱乐');
    expect(dashboard().activeTabId).toBe(created.id);
    expect(screen.getByRole('dialog', { name: '为「娱乐」选择文件夹' })).toBeInTheDocument();

    await click(screen.getByRole('checkbox', { name: /学习/ }));
    await click(screen.getByRole('button', { name: '保存到页签' }));

    await waitFor(() => expect(dashboard().tabs[1].folderIds).toEqual(['f2']));
    expect(screen.queryByRole('dialog', { name: '为「娱乐」选择文件夹' })).not.toBeInTheDocument();
    expect(store.getState().toasts.at(-1)?.message).toBe('「娱乐」现在展示 1 个文件夹');
    expect(screen.getByRole('heading', { name: '学习' })).toBeInTheDocument();
  });

  it('取消新建页签不会改动设置', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '新建页签' }));
    fireEvent.change(screen.getByLabelText('页签名称'), { target: { value: '娱乐' } });
    await click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog', { name: '新建页签' })).not.toBeInTheDocument();
    expect(dashboard().tabs).toEqual(TABS);
  });

  it('重命名页签后写回新名称', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '重命名页签 工作' }));

    const input = screen.getByLabelText('页签名称');
    expect(input).toHaveValue('工作');
    fireEvent.change(input, { target: { value: '日常' } });
    await click(screen.getByRole('button', { name: /保存名称/ }));

    await waitFor(() => expect(dashboard().tabs[0].name).toBe('日常'));
    expect(screen.queryByRole('dialog', { name: '重命名页签' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /日常/ })).toBeInTheDocument();
    expect((await getBackend().storageGet<Settings>(SETTINGS_KEY))?.dashboard.tabs[0].name).toBe('日常');
  });

  it('重命名为空白时按钮禁用且回车不提交', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '重命名页签 工作' }));
    const input = screen.getByLabelText('页签名称');
    fireEvent.change(input, { target: { value: '  ' } });

    const submit = screen.getByRole('button', { name: /保存名称/ });
    expect(submit).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(dashboard().tabs[0].name).toBe('工作');
    expect(screen.getByRole('dialog', { name: '重命名页签' })).toBeInTheDocument();
  });

  it('删除页签确认框取消后保留原配置', async () => {
    await seedSettings({ tabs: TWO_TABS });
    await renderApp();
    await click(screen.getByRole('button', { name: '删除页签 工作' }));

    expect(screen.getByRole('dialog', { name: '删除页签「工作」' })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog', { name: '删除页签「工作」' })).not.toBeInTheDocument();
    expect(dashboard().tabs).toEqual(TWO_TABS);
    expect(dashboard().activeTabId).toBe('tab-1');
  });

  it('确认删除页签后移除配置并把激活项回退到第一个页签', async () => {
    await seedSettings({ tabs: TWO_TABS });
    await renderApp();
    await click(screen.getByRole('button', { name: '删除页签 工作' }));
    await click(screen.getByRole('button', { name: '删除页签'}));

    await waitFor(() => expect(dashboard().tabs.map((tab) => tab.id)).toEqual(['tab-2']));
    expect(dashboard().activeTabId).toBe('tab-2');
    expect(screen.queryByRole('dialog', { name: '删除页签「工作」' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /学习/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('newtab App 文件夹选择与书签编辑', () => {
  it('文件夹选择器全不选后保存，首页回到引导空态', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '选择文件夹' }));

    const dialog = screen.getByRole('dialog', { name: '为「工作」选择文件夹' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /工作/ })).toHaveAttribute('aria-checked', 'true');

    await click(screen.getByRole('button', { name: '全不选' }));
    await click(screen.getByRole('button', { name: '保存到页签' }));

    await waitFor(() => expect(dashboard().tabs[0].folderIds).toEqual([]));
    expect(screen.getByText('这个页签还没有选择文件夹')).toBeInTheDocument();
    expect(store.getState().toasts.at(-1)?.message).toBe('「工作」现在展示 0 个文件夹');
  });

  it('文件夹选择器取消后不写回勾选结果', async () => {
    await renderApp();
    await click(screen.getByRole('button', { name: '选择文件夹' }));
    await click(screen.getByRole('checkbox', { name: /学习/ }));
    expect(screen.getByText('已选 2 个')).toBeInTheDocument();

    await click(screen.getByRole('button', { name: '取消' }));
    expect(dashboard().tabs[0].folderIds).toEqual(['f1']);
    expect(screen.queryByRole('dialog', { name: '为「工作」选择文件夹' })).not.toBeInTheDocument();
  });

  it('编辑书签打开详情抽屉，取消删除后书签仍在', async () => {
    await renderApp();
    await click(screen.getByLabelText('编辑 项目看板'));
    expect(screen.getByRole('dialog', { name: '项目看板' })).toBeInTheDocument();

    await click(screen.getByRole('button', { name: '删除'}));
    expect(screen.getByRole('dialog', { name: '删除 1 项' })).toBeInTheDocument();
    expect(screen.getByText('项目看板', { selector: 'span' })).toBeInTheDocument();

    await click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '删除 1 项' })).not.toBeInTheDocument();
    expect(store.getState().flat.some((item) => item.id === 'b1')).toBe(true);
    expect(screen.getByLabelText('打开 项目看板')).toBeInTheDocument();
  });

  it('确认删除书签后从首页移除并给出可撤销提示', async () => {
    await renderApp();
    await click(screen.getByLabelText('编辑 项目看板'));
    await click(screen.getByRole('button', { name: '删除'}));
    await click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(store.getState().flat.some((item) => item.id === 'b1')).toBe(false));
    expect(screen.queryByLabelText('打开 项目看板')).not.toBeInTheDocument();
    expect(store.getState().toasts.at(-1)?.message).toBe('已删除 1 项，可在回收站恢复');
    expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
  });
});