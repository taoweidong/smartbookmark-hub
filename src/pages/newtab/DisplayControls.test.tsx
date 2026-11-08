import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend } from '@/core/backend';
import { cache } from '@/core/cache';
import { SETTINGS_KEY } from '@/core/constants';
import { defaultSettings } from '@/core/settings';
import { store } from '@/core/store';
import type { Settings } from '@/core/types';
import { BACKGROUND_ASSET_KEY } from './BackgroundLayer';
import { DisplayControls } from './DisplayControls';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function pngFile(): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
  return new File([bytes], 'bg.png', { type: 'image/png' });
}

async function seed(over: Partial<Settings['dashboard']> = {}) {
  const settings: Settings = {
    ...defaultSettings(),
    dashboard: { ...defaultSettings().dashboard, seeded: true, ...over },
  };
  await getBackend().storageSet(SETTINGS_KEY, settings);
  act(() => {
    store.setState({ settings, loading: false });
  });
}

function renderControls() {
  const onPickFolders = vi.fn();
  render(<DisplayControls onPickFolders={onPickFolders} />);
  return { onPickFolders };
}

async function click(node: Element) {
  await act(async () => {
    fireEvent.click(node);
  });
}

async function change(node: Element, value: string) {
  await act(async () => {
    fireEvent.change(node, { target: { value } });
  });
}

const dashboard = () => store.getState().settings.dashboard;

describe('DisplayControls', () => {
  beforeEach(async () => {
    await seed();
  });

  it('切换到列表布局并写回设置', async () => {
    renderControls();
    const list = screen.getByRole('button', { name: '列表' });
    expect(screen.getByRole('button', { name: '网格' })).toHaveAttribute('aria-pressed', 'true');

    await click(list);
    await waitFor(() => expect(dashboard().layout).toBe('list'));
    expect(list).toHaveAttribute('aria-pressed', 'true');
    expect((await getBackend().storageGet<Settings>(SETTINGS_KEY))?.dashboard.layout).toBe('list');
  });

  it('从列表切回网格布局', async () => {
    await seed({ layout: 'list' });
    renderControls();
    await click(screen.getByRole('button', { name: '网格' }));
    await waitFor(() => expect(dashboard().layout).toBe('grid'));
  });

  it('卡片尺寸可在紧凑/标准/宽松之间切换', async () => {
    renderControls();
    await click(screen.getByRole('button', { name: '紧凑' }));
    await waitFor(() => expect(dashboard().cardSize).toBe('sm'));

    await click(screen.getByRole('button', { name: '宽松' }));
    await waitFor(() => expect(dashboard().cardSize).toBe('lg'));
    expect(screen.getByRole('button', { name: '宽松' })).toHaveAttribute('aria-pressed', 'true');

    await click(screen.getByRole('button', { name: '标准' }));
    await waitFor(() => expect(dashboard().cardSize).toBe('md'));
  });

  it('排序下拉把四种排序写回设置', async () => {
    renderControls();
    const select = screen.getByLabelText('文件夹内排序');
    expect(select).toHaveValue('default');

    for (const value of ['recent', 'title', 'host', 'default'] as const) {
      await change(select, value);
      await waitFor(() => expect(dashboard().sort).toBe(value));
    }
    expect(screen.getByRole('option', { name: '标题 A→Z' })).toBeInTheDocument();
  });

  it('每组数量滑杆写回 perFolder 并即时回显', async () => {
    renderControls();
    const range = screen.getByLabelText('每个文件夹显示的书签数');
    expect(range).toHaveValue('8');

    await change(range, '16');
    await waitFor(() => expect(dashboard().perFolder).toBe(16));
    expect(screen.getByText('16')).toBeInTheDocument();
    expect((range as HTMLInputElement).style.getPropertyValue('--pct')).toBe('60%');
  });

  it('选择纯色背景后写入类型并显示取色器', async () => {
    renderControls();
    await change(screen.getByLabelText('背景样式'), 'solid');

    await waitFor(() => expect(dashboard().background.type).toBe('solid'));
    expect(screen.getByLabelText('背景颜色')).toHaveValue('#101731');
    expect(screen.queryByLabelText('更换背景图片')).not.toBeInTheDocument();
  });

  it('取色器选色写回背景颜色', async () => {
    await seed({ background: { type: 'solid', value: '' } });
    renderControls();
    await change(screen.getByLabelText('背景颜色'), '#ff8800');

    await waitFor(() => expect(dashboard().background.value).toBe('#ff8800'));
    expect(dashboard().background.type).toBe('solid');
  });

  it('缓存里已有图片时选择自定义图片直接生效', async () => {
    await cache.set(BACKGROUND_ASSET_KEY, PNG_DATA_URL);
    renderControls();
    await change(screen.getByLabelText('背景样式'), 'image');

    await waitFor(() => expect(dashboard().background).toEqual({ type: 'image', value: BACKGROUND_ASSET_KEY }));
    expect(screen.getByRole('button', { name: '更换背景图片' })).toBeInTheDocument();
  });

  it('缓存里没有图片时选择自定义图片会打开文件选择框且不写设置', async () => {
    renderControls();
    const input = screen.getByLabelText('选择背景图片') as HTMLInputElement;
    const openDialog = vi.spyOn(input, 'click').mockImplementation(() => {});

    await change(screen.getByLabelText('背景样式'), 'image');
    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(dashboard().background.type).toBe('aurora');
  });

  it('从自定义图片切回极光背景', async () => {
    await seed({ background: { type: 'image', value: BACKGROUND_ASSET_KEY } });
    renderControls();
    expect(screen.getByLabelText('背景样式')).toHaveValue('image');

    await change(screen.getByLabelText('背景样式'), 'aurora');
    await waitFor(() => expect(dashboard().background.type).toBe('aurora'));
    expect(screen.queryByRole('button', { name: '更换背景图片' })).not.toBeInTheDocument();
  });

  it('点击主色按钮写回 accent 并标记选中', async () => {
    renderControls();
    const azure = screen.getByRole('button', { name: '主色 青金' });
    expect(screen.getByRole('button', { name: '主色 鎏金' })).toHaveAttribute('aria-pressed', 'true');

    await click(azure);
    await waitFor(() => expect(store.getState().settings.accent).toBe('azure'));
    expect(azure).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '主色 鎏金' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('统计开关来回切换 showStats', async () => {
    renderControls();
    const toggle = screen.getByRole('button', { name: '统计' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await click(toggle);
    await waitFor(() => expect(dashboard().showStats).toBe(false));
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await click(toggle);
    await waitFor(() => expect(dashboard().showStats).toBe(true));
  });

  it('重置视图把布局、尺寸、排序、数量、统计与背景写回默认值', async () => {
    await seed({
      layout: 'list',
      cardSize: 'lg',
      sort: 'host',
      perFolder: 20,
      showStats: false,
      background: { type: 'solid', value: '#123456' },
    });
    renderControls();
    await click(screen.getByRole('button', { name: '重置视图' }));

    await waitFor(() => expect(dashboard().background).toEqual({ type: 'aurora', value: '' }));
    expect(dashboard()).toMatchObject({ layout: 'grid', cardSize: 'md', sort: 'default', perFolder: 8, showStats: true });
    expect(screen.getByLabelText('每个文件夹显示的书签数')).toHaveValue('8');
  });

  it('点击选择文件夹触发外部回调', async () => {
    const { onPickFolders } = renderControls();
    await click(screen.getByRole('button', { name: '选择文件夹' }));
    expect(onPickFolders).toHaveBeenCalledTimes(1);
  });

  it('更换背景图片按钮打开文件选择框', async () => {
    await seed({ background: { type: 'image', value: BACKGROUND_ASSET_KEY } });
    renderControls();
    const input = screen.getByLabelText('选择背景图片') as HTMLInputElement;
    const openDialog = vi.spyOn(input, 'click').mockImplementation(() => {});

    await click(screen.getByRole('button', { name: '更换背景图片' }));
    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it('选择 PNG 文件后写入缓存与设置并弹出成功提示', async () => {
    renderControls();
    const input = screen.getByLabelText('选择背景图片');
    await act(async () => {
      fireEvent.change(input, { target: { files: [pngFile()] } });
    });

    await waitFor(() => expect(dashboard().background).toEqual({ type: 'image', value: BACKGROUND_ASSET_KEY }));
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe(PNG_DATA_URL);
    expect(store.getState().toasts.at(-1)).toMatchObject({ message: '背景图已更新，仅保存在本机', tone: 'success' });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('选择超过 8MB 的文件时弹出失败提示且不改设置', async () => {
    renderControls();
    const huge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('选择背景图片'), { target: { files: [huge] } });
    });

    await waitFor(() => expect(store.getState().toasts.at(-1)?.tone).toBe('danger'));
    expect(store.getState().toasts.at(-1)?.message).toContain('8MB');
    expect(dashboard().background).toEqual({ type: 'aurora', value: '' });
    expect(await cache.get(BACKGROUND_ASSET_KEY)).toBeUndefined();
  });

  it('文件选择被取消时不写设置也不弹提示', async () => {
    renderControls();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('选择背景图片'), { target: { files: [] } });
    });

    expect(dashboard().background).toEqual({ type: 'aurora', value: '' });
    expect(store.getState().toasts).toHaveLength(0);
  });
});