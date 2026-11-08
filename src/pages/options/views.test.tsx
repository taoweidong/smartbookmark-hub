import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getBackend } from '@/core/backend';
import { store } from '@/core/store';
import { bookmarkService } from '@/core/bookmarks';
import { toJsonBackup } from '@/core/exportHtml';
import { deleteWithUndo, listTrash } from '@/core/trash';
import type { BookmarkNode } from '@/core/types';
import type { ConfirmRequest } from '@/ui/components/Modal';
import type { EditorTarget } from '@/ui/components/BookmarkEditor';
import { BookmarkEditor } from '@/ui/components/BookmarkEditor';
import { BackupView } from './BackupView';
import { SettingsView } from './SettingsView';
import { demoFetchFor } from './demoScan';
import { TrashPanel } from './TrashPanel';

async function seedStore() {
  await store.getState().init();
}

describe('BookmarkEditor', () => {
  it('新建书签：校验非法网址，成功后关闭抽屉并入库', async () => {
    await seedStore();
    const onClose = vi.fn();
    render(<BookmarkEditor target={{ mode: 'create', parentId: '1' }} onClose={onClose} />);

    const save = screen.getByRole('button', { name: '添加书签' });
    fireEvent.change(screen.getByLabelText('书签标题'), { target: { value: '单元测试页' } });
    fireEvent.change(screen.getByLabelText('书签网址'), { target: { value: 'javascript:alert(1)' } });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('书签网址'), { target: { value: 'https://unit.example.com/' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.getState().flat.some((item) => item.url === 'https://unit.example.com/')).toBe(true));
  });

  it('编辑书签：修改标题保存后生效并弹出成功提示', async () => {
    await seedStore();
    const created = await bookmarkService.create({ parentId: '1', title: '旧标题', url: 'https://edit.example.com/' });
    const flat = store.getState().flat;
    const bookmark = flat.find((item) => item.id === created.id) ?? {
      id: created.id,
      title: '旧标题',
      url: 'https://edit.example.com/',
      parentId: '1',
      folderPath: ['书签栏'],
      dateAdded: created.dateAdded ?? 0,
    };

    const onClose = vi.fn();
    render(<BookmarkEditor target={{ mode: 'edit', bookmark }} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: '旧标题' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('书签标题'), { target: { value: '新标题' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.getState().toasts.some((toast) => toast.message === '已保存修改')).toBe(true));
    const tree = await getBackend().getTree();
    expect(JSON.stringify(tree)).toContain('新标题');
  });

  it('为新建书签附加标签并写入 settings.tags', async () => {
    await seedStore();
    const onClose = vi.fn();
    render(<BookmarkEditor target={{ mode: 'create', parentId: '1' }} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('书签标题'), { target: { value: '带标签页' } });
    fireEvent.change(screen.getByLabelText('书签网址'), { target: { value: 'https://tagged.example.com/' } });
    const tagInput = screen.getByLabelText('添加标签');
    fireEvent.change(tagInput, { target: { value: '重要' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '添加书签' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const entry = Object.entries(store.getState().settings.tags).find(([, tags]) => tags.includes('重要'));
      expect(entry).toBeTruthy();
    });
  });

  it('编辑器作为抽屉渲染，删除按钮交由父级处理', async () => {
    await seedStore();
    const created = await bookmarkService.create({ parentId: '1', title: '待删页', url: 'https://del.example.com/' });
    const bookmark = {
      id: created.id,
      title: '待删页',
      url: 'https://del.example.com/',
      parentId: '1',
      folderPath: ['书签栏'],
      dateAdded: created.dateAdded ?? 0,
    };
    const onDelete = vi.fn<(bookmark: { id: string }) => void>();
    render(<BookmarkEditor target={{ mode: 'edit', bookmark } as EditorTarget} onClose={() => {}} onDelete={onDelete} />);

    expect(screen.getByRole('dialog', { name: '待删页' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: created.id }));
  });
});

describe('TrashPanel', () => {
  async function seedTrash() {
    await seedStore();
    const a = await bookmarkService.create({ parentId: '1', title: '回收页', url: 'https://trash.example.com/' });
    return deleteWithUndo([a.id], '单元删除批次');
  }

  it('列出批次，展开可见节点，恢复后批次消失', async () => {
    await seedTrash();
    render(<TrashPanel requestConfirm={() => {}} />);

    await waitFor(() => expect(screen.getByText('单元删除批次')).toBeInTheDocument());
    expect(screen.getByText(/1 批 · 1 项/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /单元删除批次/ }));
    expect(screen.getByText('回收页')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /恢复/ }));
    await waitFor(() =>
      expect(store.getState().toasts.some((toast) => toast.message === '已恢复 1 项到原位置')).toBe(true),
    );
    expect(await listTrash()).toHaveLength(0);
    expect(screen.getByText('回收站是空的')).toBeInTheDocument();
  });

  it('永久删除走确认框', async () => {
    await seedTrash();
    const requests: ConfirmRequest[] = [];
    render(<TrashPanel requestConfirm={(request) => requests.push(request)} />);

    await waitFor(() => expect(screen.getByText('单元删除批次')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('永久删除这一批'));
    expect(requests).toHaveLength(1);
    expect(requests[0].title).toBe('永久删除这一批');

    await act(async () => {
      await requests[0].onConfirm();
    });
    await waitFor(async () => expect(await listTrash()).toHaveLength(0));
  });
});

describe('BackupView', () => {
  it('导出 HTML 触发本地下载并提示', async () => {
    await seedStore();
    const createObjectURL = vi.fn(() => 'blob:mock');
    (URL as { createObjectURL?: unknown }).createObjectURL = createObjectURL;
    render(<BackupView requestConfirm={() => {}} />);

    const button = screen.getByRole('button', { name: /导出 HTML/ });
    fireEvent.click(button);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(store.getState().toasts.some((toast) => toast.message.includes('条书签为标准 HTML'))).toBe(true),
    );
  });

  it('空 HTML 文件给出警告而不进入预览', async () => {
    await seedStore();
    render(<BackupView requestConfirm={() => {}} />);
    const file = new File(['<html><body></body></html>'], 'empty.html', { type: 'text/html' });
    fireEvent.change(screen.getByLabelText('选择 HTML 书签文件'), { target: { files: [file] } });

    await waitFor(() =>
      expect(
        store.getState().toasts.some((toast) => toast.message.includes('文件中没有可导入的书签')),
      ).toBe(true),
    );
    expect(screen.queryByText(/已解析 empty\.html/)).not.toBeInTheDocument();
  });

  it('JSON 备份恢复：书签重建且标签按新 id 回写', async () => {
    await seedStore();
    const tree: BookmarkNode[] = [{ id: 'n1', title: '备份页', url: 'https://backup.example.com/' }];
    const json = toJsonBackup(tree, { n1: ['重要'] });
    const requests: ConfirmRequest[] = [];
    render(<BackupView requestConfirm={(request) => requests.push(request)} />);

    const file = new File([json], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('选择 JSON 备份文件'), { target: { files: [file] } });

    await waitFor(() => expect(requests.length).toBe(1));
    expect(requests[0].title).toBe('从 JSON 备份恢复');

    await act(async () => {
      await requests[0].onConfirm();
    });
    await waitFor(() => expect(store.getState().flat.some((item) => item.url === 'https://backup.example.com/')).toBe(true));
    await waitFor(() => {
      const tagged = Object.values(store.getState().settings.tags).some((tags) => tags.includes('重要'));
      expect(tagged).toBe(true);
    });
  });
});

describe('SettingsView', () => {
  it('切换包含历史记录开关写入设置', async () => {
    await seedStore();
    render(<SettingsView requestConfirm={() => {}} />);
    const initial = store.getState().settings.search.includeHistory;

    fireEvent.click(screen.getByRole('switch', { name: '包含历史记录' }));
    await waitFor(() => expect(store.getState().settings.search.includeHistory).toBe(!initial));
  });

  it('滑杆调整搜索参数并持久化', async () => {
    await seedStore();
    render(<SettingsView requestConfirm={() => {}} />);
    fireEvent.change(screen.getByRole('slider', { name: '历史范围' }), { target: { value: '30' } });
    await waitFor(() => expect(store.getState().settings.search.historyDays).toBe(30));
  });

  it('主题切换写入设置', async () => {
    await seedStore();
    render(<SettingsView requestConfirm={() => {}} />);
    fireEvent.click(screen.getByText('宣纸'));
    await waitFor(() => expect(store.getState().settings.theme).toBe('light'));
  });

  it('权限状态展示并可撤销/授予', async () => {
    await seedStore();
    render(<SettingsView requestConfirm={() => {}} />);

    const revoke = await screen.findByRole('button', { name: '撤销权限' });
    fireEvent.click(revoke);
    await waitFor(() =>
      expect(store.getState().toasts.some((toast) => toast.message === '已撤销网站访问权限')).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '授予权限' })).toBeInTheDocument());
  });

  it('清除检测缓存走确认框并执行', async () => {
    await seedStore();
    const requests: ConfirmRequest[] = [];
    render(<SettingsView requestConfirm={(request) => requests.push(request)} />);

    fireEvent.click(screen.getByRole('button', { name: /清除检测缓存/ }));
    expect(requests[0].title).toBe('清除检测缓存');
    await act(async () => {
      await requests[0].onConfirm();
    });
    await waitFor(() =>
      expect(store.getState().toasts.some((toast) => toast.message === '检测缓存已清除')).toBe(true),
    );
  });
});

describe('demoScan', () => {
  it('按主机名前缀分类状态码，公共站点不被误伤', async () => {
    const fetchImpl = demoFetchFor([
      { id: '1', title: '邮箱', url: 'https://mail.qq.com/', parentId: '1', folderPath: [], dateAdded: 0 },
      { id: '2', title: 'Gmail', url: 'https://gmail.com/', parentId: '1', folderPath: [], dateAdded: 0 },
      { id: '3', title: '死链', url: 'https://dead-link.example.com/', parentId: '1', folderPath: [], dateAdded: 0 },
    ]);
    expect((await fetchImpl('https://mail.qq.com/')).status).toBe(403);
    expect((await fetchImpl('https://gmail.com/')).status).toBe(200);
    expect((await fetchImpl('https://dead-link.example.com/')).status).toBe(404);
  });

  it('尊重取消信号，中止时拒绝请求', async () => {
    const fetchImpl = demoFetchFor([]);
    const controller = new AbortController();
    const pending = fetchImpl('https://a.example.com/', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
