import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/core/cache';
import { defaultSettings } from '@/core/settings';
import { store } from '@/core/store';
import type { Settings } from '@/core/types';
import { BACKGROUND_ASSET_KEY, BackgroundLayer, storeBackgroundImage } from './BackgroundLayer';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function imageFile(type = 'image/png', name = 'bg.png'): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type });
}

function dataUrlOf(type: string): string {
  return `data:${type};base64,${PNG_BASE64}`;
}

function setBackground(background: Settings['dashboard']['background']): void {
  const base = defaultSettings();
  act(() => {
    store.setState({ settings: { ...base, dashboard: { ...base.dashboard, background } } });
  });
}

/** 非 PNG 分支依赖 Image 加载，jsdom 不会触发 onload/onerror，这里手动驱动 */
function stubImage(mode: 'load' | 'error', width = 4000, height = 2000): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = width;
    height = height;
    set src(_value: string) {
      queueMicrotask(() => {
        if (mode === 'error') this.onerror?.();
        else this.onload?.();
      });
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

function stubCanvas(getContext: () => unknown, toDataURL = 'data:image/jpeg;base64,compact') {
  const drawImage = vi.fn();
  const encode = vi.fn(() => toDataURL);
  const fake = { width: 0, height: 0, getContext, toDataURL: encode, drawImage };
  const native = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName !== 'canvas') return native(tagName, options);
    return fake;
  }) as unknown as typeof document.createElement);
  return { fake, drawImage, encode };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storeBackgroundImage', () => {
  it('拒绝超过 8MB 的文件且不写入缓存', async () => {
    const huge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
    await expect(storeBackgroundImage(huge)).rejects.toThrow('背景图片请小于 8MB');
    expect(await cache.get(BACKGROUND_ASSET_KEY)).toBeUndefined();
  });

  it('恰好 8MB 的文件仍然被接受', async () => {
    const edge = new File([new Uint8Array(8 * 1024 * 1024)], 'edge.png', { type: 'image/png' });
    await expect(storeBackgroundImage(edge)).resolves.toBeUndefined();
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toMatch(/^data:image\/png;base64,/);
  });

  it('PNG 直接保存原始 dataURL，不创建 canvas', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    await storeBackgroundImage(imageFile());

    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe(PNG_DATA_URL);
    expect(createElement.mock.calls.some(([tagName]) => tagName === 'canvas')).toBe(false);
  });

  it('FileReader 读取失败时抛出读取错误', async () => {
    class BrokenReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(): void {
        this.onerror?.();
      }
    }
    vi.stubGlobal('FileReader', BrokenReader);

    await expect(storeBackgroundImage(imageFile())).rejects.toThrow('读取图片失败');
    expect(await cache.get(BACKGROUND_ASSET_KEY)).toBeUndefined();
  });

  it('非 PNG 图片加载失败时回退保存原始 dataURL', async () => {
    stubImage('error');
    await storeBackgroundImage(imageFile('image/jpeg', 'bg.jpg'));
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe(dataUrlOf('image/jpeg'));
  });

  it('非 PNG 图片拿不到 canvas 上下文时回退保存原始 dataURL', async () => {
    stubImage('load');
    stubCanvas(() => null);

    await storeBackgroundImage(imageFile('image/jpeg', 'bg.jpg'));
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe(dataUrlOf('image/jpeg'));
  });

  it('非 PNG 图片按最长边 1920 压缩并保存 JPEG', async () => {
    stubImage('load', 4000, 2000);
    const ctx = { drawImage: vi.fn() };
    const { fake, encode } = stubCanvas(() => ctx, 'data:image/jpeg;base64,compact');

    await storeBackgroundImage(imageFile('image/jpeg', 'bg.jpg'));

    expect(fake.width).toBe(1920);
    expect(fake.height).toBe(960);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1920, 960]);
    expect(encode).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe('data:image/jpeg;base64,compact');
  });

  it('小图不放大，压缩过程抛错时回退原始 dataURL', async () => {
    stubImage('load', 800, 600);
    const ctx = {
      drawImage: () => {
        throw new Error('内存不足');
      },
    };
    const { fake } = stubCanvas(() => ctx);

    await expect(storeBackgroundImage(imageFile('image/webp', 'bg.webp'))).resolves.toBeUndefined();
    expect(fake.width).toBe(800);
    expect(fake.height).toBe(600);
    expect(await cache.get<string>(BACKGROUND_ASSET_KEY)).toBe(dataUrlOf('image/webp'));
  });
});

describe('BackgroundLayer 组件', () => {
  it('image 类型时从缓存异步读出并渲染 backgroundImage', async () => {
    await cache.set(BACKGROUND_ASSET_KEY, PNG_DATA_URL);
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY });

    const { container } = render(<BackgroundLayer />);
    await waitFor(() => expect(container.querySelector('.bg-cover')).not.toBeNull());

    const layer = container.querySelector('.bg-cover') as HTMLElement;
    expect(layer.style.backgroundImage).toContain(PNG_DATA_URL);
    expect(container.querySelector('.aurora-layer')).toBeNull();
  });

  it('缓存里没有图片时不渲染图片层，装饰层始终存在', async () => {
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY });
    const { container } = render(<BackgroundLayer />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.bg-cover')).toBeNull();
    expect(container.querySelector('.grid-layer')).not.toBeNull();
    expect(container.querySelector('.grain-layer')).not.toBeNull();
  });

  it('从 image 切回 aurora 时清掉已渲染的图片', async () => {
    await cache.set(BACKGROUND_ASSET_KEY, PNG_DATA_URL);
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY });
    const { container } = render(<BackgroundLayer />);
    await waitFor(() => expect(container.querySelector('.bg-cover')).not.toBeNull());

    setBackground({ type: 'aurora', value: '' });
    await waitFor(() => expect(container.querySelector('.bg-cover')).toBeNull());
    expect(container.querySelector('.aurora-layer')).not.toBeNull();
  });

  it('aurora 与 solid 背景不会读取图片缓存', async () => {
    const get = vi.spyOn(cache, 'get');
    setBackground({ type: 'aurora', value: '' });
    const { container, rerender } = render(<BackgroundLayer />);
    expect(container.querySelector('.aurora-layer')).not.toBeNull();

    setBackground({ type: 'solid', value: '#223355' });
    rerender(<BackgroundLayer />);
    expect(container.querySelector('.fixed.inset-0.z-0')).not.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('组件卸载后缓存回调不再 setState', async () => {
    let release!: (value: string | undefined) => void;
    const gate = new Promise<string | undefined>((resolve) => {
      release = resolve;
    });
    const get = vi.spyOn(cache, 'get').mockImplementation((() => gate) as unknown as typeof cache.get);
    const onError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY });

    const { unmount } = render(<BackgroundLayer />);
    expect(get).toHaveBeenCalledWith(BACKGROUND_ASSET_KEY);
    unmount();

    await act(async () => {
      release(PNG_DATA_URL);
      await gate;
    });
    expect(onError).not.toHaveBeenCalled();
  });
});
describe('换背景图 revision（v2 R5.1）', () => {
  it('revision 变化触发重新加载背景图，无需刷新页面', async () => {
    await cache.set(BACKGROUND_ASSET_KEY, 'data:image/jpeg;base64,OLD');
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY, revision: 1 });
    const { rerender } = render(<BackgroundLayer />);
    const layer = () => document.querySelector('div.fixed.inset-0.z-0')?.querySelector('div') as HTMLElement | null;
    await waitFor(() => expect(layer()?.style.backgroundImage).toContain('OLD'));

    await cache.set(BACKGROUND_ASSET_KEY, 'data:image/jpeg;base64,NEW');
    setBackground({ type: 'image', value: BACKGROUND_ASSET_KEY, revision: 2 });
    rerender(<BackgroundLayer />);
    await waitFor(() => expect(layer()?.style.backgroundImage).toContain('NEW'));
  });
});
