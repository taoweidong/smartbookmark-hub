import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CACHE_PREFIX, cache } from '@/core/cache';
import { store } from '@/core/store';
import { defaultSettings } from '@/core/settings';
import type { DeadLinkItem, FlatBookmark, ScanReport } from '@/core/types';
import type { ConfirmRequest } from '@/ui/components/Modal';
import { CleanerView } from './CleanerView';

function bookmark(id: string, title: string, url: string): FlatBookmark {
  return { id, title, url, parentId: 'f1', folderPath: ['书签栏', '工作'], dateAdded: 1700000000000 };
}

function deadLink(b: FlatBookmark, status: 'dead' | 'blocked' | 'timeout', httpStatus?: number): DeadLinkItem {
  return {
    bookmark: b,
    health: {
      canonicalUrl: b.url,
      status,
      ...(httpStatus ? { httpStatus } : {}),
      checkedAt: Date.now(),
      ...(status === 'dead' ? { message: `HTTP ${httpStatus}` } : {}),
    },
  };
}

async function seedReport(over: Partial<ScanReport> = {}): Promise<ScanReport> {
  const report: ScanReport = {
    id: 'scan-1',
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now(),
    total: 4,
    checked: 4,
    deadLinks: [deadLink(bookmark('b1', '已下线文档', 'https://gone.example.com/'), 'dead', 404)],
    blocked: [deadLink(bookmark('b2', '内网门禁', 'https://intranet.example.com/'), 'blocked', 403)],
    errors: [deadLink(bookmark('b3', '慢速站点', 'https://slow.example.com/'), 'timeout')],
    duplicates: [
      {
        key: 'https://kanban.example.com/',
        reason: 'url',
        items: [bookmark('b4', '项目看板', 'https://kanban.example.com/'), bookmark('b5', '项目看板副本', 'https://kanban.example.com/?utm_source=x')],
        keepId: 'b4',
        similarity: 1,
      },
    ],
    emptyFolders: [{ id: 'f9', title: '空目录', path: ['书签栏', '空目录'] }],
    cursor: 4,
    cancelled: false,
    ...over,
  };
  await cache.set(CACHE_PREFIX.report + report.id, report);
  return report;
}

describe('CleanerView', () => {
  it('加载历史报告并渲染统计与分类页签', async () => {
    await seedReport();
    render(<CleanerView requestConfirm={() => {}} onHealthChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());
    expect(screen.getByText('4/4')).toBeInTheDocument();
    for (const label of ['失效链接', '重复书签', '空文件夹', '访问受限', '检测异常']) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('失效链接页签提供批量清理并弹确认', async () => {
    await seedReport();
    const requestConfirm = vi.fn<(request: ConfirmRequest) => void>();
    render(<CleanerView requestConfirm={requestConfirm} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /清理全部 1 条/ }));
    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(requestConfirm.mock.calls[0][0].title).toBe('删除 1 项');
    expect(requestConfirm.mock.calls[0][0].danger).toBe(true);
  });

  it('访问受限页签只有说明，不提供删除入口', async () => {
    await seedReport();
    const requestConfirm = vi.fn();
    render(<CleanerView requestConfirm={requestConfirm} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /访问受限/ }));
    expect(screen.getByText('内网门禁')).toBeInTheDocument();
    expect(screen.getByText(/通常意味着需要登录或被限流/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /清理全部/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('删除 内网门禁')).not.toBeInTheDocument();
    expect(requestConfirm).not.toHaveBeenCalled();
  });

  it('重复书签显示同组条目并标记保留项', async () => {
    await seedReport();
    render(<CleanerView requestConfirm={() => {}} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /重复书签/ }));
    expect(screen.getByText('同一网址')).toBeInTheDocument();
    expect(screen.getByText('项目看板')).toBeInTheDocument();
    expect(screen.getByText('项目看板副本')).toBeInTheDocument();
    expect(screen.getByText('保留')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保留最早，删除其余 1 条/ })).toBeInTheDocument();
  });

  it('空文件夹页签列出路径并可一键清理', async () => {
    await seedReport();
    const requestConfirm = vi.fn();
    render(<CleanerView requestConfirm={requestConfirm} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /空文件夹/ }));
    expect(screen.getByText('书签栏 / 空目录')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一键清理' }));
    expect(requestConfirm).toHaveBeenCalledTimes(1);
    expect(requestConfirm.mock.calls[0][0].title).toBe('删除 1 项');
  });

  it('切换到另一份报告更新展示', async () => {
    await seedReport();
    await seedReport({
      id: 'scan-2',
      startedAt: Date.now(),
      deadLinks: [],
      blocked: [],
      errors: [],
      duplicates: [],
      emptyFolders: [],
    });
    render(<CleanerView requestConfirm={() => {}} onHealthChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('4/4')).toBeInTheDocument());
    // 历史报告按时间倒序，最新一份（scan-2）排在最前
    fireEvent.click(screen.getByText('4 条 · 0 失效'));
    await waitFor(() => expect(screen.getByText('没有发现失效链接。')).toBeInTheDocument());
  });

  it('设置里的扫描参数渲染为滑杆并可调整', async () => {
    await seedReport();
    render(<CleanerView requestConfirm={() => {}} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('已下线文档')).toBeInTheDocument());

    const concurrency = screen.getByRole('slider', { name: '并发请求数' });
    expect((concurrency as HTMLInputElement).value).toBe(String(defaultSettings().scan.concurrency));
    fireEvent.change(concurrency, { target: { value: '8' } });
    await waitFor(() => expect(store.getState().settings.scan.concurrency).toBe(8));
  });
});

describe('报告即时修剪（v2 R6d）', () => {
  it('删除书签后报告对应条目即时移除', async () => {
    await store.getState().init();
    const victim = store.getState().flat[0];
    await cache.set(CACHE_PREFIX.report + 'scan-live', {
      id: 'scan-live',
      startedAt: Date.now(),
      finishedAt: Date.now(),
      total: 1,
      checked: 1,
      deadLinks: [
        {
          bookmark: victim,
          health: { canonicalUrl: victim.url, status: 'dead', httpStatus: 404, checkedAt: Date.now() },
        },
      ],
      blocked: [],
      errors: [],
      duplicates: [],
      emptyFolders: [],
      cursor: 1,
      cancelled: false,
    });

    const requests: ConfirmRequest[] = [];
    render(<CleanerView requestConfirm={(request) => requests.push(request)} onHealthChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText(victim.title)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /清理全部 1 条/ }));
    await act(async () => {
      await requests[0].onConfirm();
    });
    await waitFor(() => expect(screen.queryByText(victim.title)).not.toBeInTheDocument());
  });
});
