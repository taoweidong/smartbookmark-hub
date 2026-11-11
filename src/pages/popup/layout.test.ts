import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBackend } from '@/core/backend';
import { createDemoBackend } from '@/core/demoBackend';
import { detectPopupLayout } from './layout';

const popupHtml = readFileSync(resolve(import.meta.dirname, '../../../popup.html'), 'utf8');
const layoutSource = readFileSync(resolve(import.meta.dirname, './layout.ts'), 'utf8');

function useBackend(isTabContext: () => Promise<boolean>): void {
  setBackend({ ...createDemoBackend(), isTabContext });
}

describe('detectPopupLayout', () => {
  afterEach(() => {
    setBackend(createDemoBackend());
    vi.unstubAllGlobals();
  });

  it('当前文档位于标签页时判为 tab', async () => {
    useBackend(async () => true);
    await expect(detectPopupLayout()).resolves.toBe('tab');
  });

  it('取不到当前标签页（工具栏弹窗）时判为 popup', async () => {
    useBackend(async () => false);
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });

  it('平台 API 不可用时降级为 popup', async () => {
    setBackend(null);
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });

  it('形态探测抛错时降级为 popup', async () => {
    useBackend(async () => {
      throw new Error('boom');
    });
    await expect(detectPopupLayout()).resolves.toBe('popup');
  });
});

describe('popup 形态探测的平台边界', () => {
  it('页面层不直接调用浏览器平台 API，统一走 Backend', () => {
    expect(layoutSource).not.toMatch(/chrome\s*\./);
    expect(layoutSource).toContain('getBackend()');
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
