import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectPopupLayout } from './layout';

const popupHtml = readFileSync(resolve(import.meta.dirname, '../../../popup.html'), 'utf8');

describe('detectPopupLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('当前文档位于标签页时判为 tab', async () => {
    vi.stubGlobal('chrome', { tabs: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) } });
    await expect(detectPopupLayout()).resolves.toBe('tab');
  });

  it('取不到当前标签页（工具栏弹窗）时判为 popup', async () => {
    vi.stubGlobal('chrome', { tabs: { getCurrent: vi.fn().mockResolvedValue(undefined) } });
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });

  it('没有 chrome API 时降级为 popup', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });

  it('getCurrent 抛错时降级为 popup', async () => {
    vi.stubGlobal('chrome', { tabs: { getCurrent: vi.fn().mockRejectedValue(new Error('boom')) } });
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });
});

describe('popup.html 双形态样式契约', () => {
  it('弹窗形态固定 360 宽、高度随内容自适应且上限 600', () => {
    expect(popupHtml).toMatch(/html body \{[^}]*width: 360px/);
    expect(popupHtml).toMatch(/html body \{[^}]*height: auto/);
    expect(popupHtml).toMatch(/html body \{[^}]*max-height: 600px/);
  });

  it('弹窗形态的根元素高度由内容决定，避免末尾死区', () => {
    expect(popupHtml).toMatch(/html \{ height: auto; \}/);
  });

  it('标签页形态铺满窗口并显式撑满高度', () => {
    expect(popupHtml).toMatch(/html\[data-sbh-layout='tab'\] \{ height: 100%; \}/);
    expect(popupHtml).toMatch(/html\[data-sbh-layout='tab'\] body \{[^}]*width: 100%/);
    expect(popupHtml).toMatch(/html\[data-sbh-layout='tab'\] body \{[^}]*height: 100%/);
  });
});
