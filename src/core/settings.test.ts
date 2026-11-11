import { describe, expect, it } from 'vitest';
import { getBackend } from './backend';
import { SETTINGS_KEY } from './constants';
import {
  defaultSettings,
  loadSettings,
  mergeSettings,
  rememberQuery,
  resetSettings,
  saveSettings,
  setTags,
} from './settings';

describe('defaultSettings', () => {
  it('提供一个默认页签与合理的扫描参数', () => {
    const settings = defaultSettings();
    expect(settings.dashboard.tabs).toHaveLength(1);
    expect(settings.dashboard.tabs[0].name).toBe('常用');
    expect(settings.dashboard.background.type).toBe('aurora');
    expect(settings.scan.concurrency).toBe(5);
    expect(settings.search.includeHistory).toBe(true);
    expect(settings.dashboard.viewBarOpen).toBe(false);
  });
});

describe('mergeSettings', () => {
  it('嵌套段做一级合并，未提及的键保留', () => {
    const base = defaultSettings();
    const next = mergeSettings(base, { search: { includeHistory: false } });
    expect(next.search.includeHistory).toBe(false);
    expect(next.search.historyDays).toBe(base.search.historyDays);
    expect(next.theme).toBe(base.theme);
  });

  it('顶层标量直接替换', () => {
    const next = mergeSettings(defaultSettings(), { theme: 'light', accent: 'azure' });
    expect(next.theme).toBe('light');
    expect(next.accent).toBe('azure');
  });

  it('tags / recentQueries 整体替换而不是合并', () => {
    const base = { ...defaultSettings(), tags: { a: ['x'] }, recentQueries: ['old'] };
    const next = mergeSettings(base, { tags: { b: ['y'] }, recentQueries: ['new'] });
    expect(next.tags).toEqual({ b: ['y'] });
    expect(next.recentQueries).toEqual(['new']);
  });
});

describe('loadSettings', () => {
  it('无存储数据时返回默认值', async () => {
    expect(await loadSettings()).toEqual(defaultSettings());
  });

  it('损坏的存储数据回退到默认值', async () => {
    await getBackend().storageSet(SETTINGS_KEY, 'not-an-object');
    expect(await loadSettings()).toEqual(defaultSettings());
  });

  it('部分存储数据与默认值深合并', async () => {
    await saveSettings({ scan: { concurrency: 9 } });
    const settings = await loadSettings();
    expect(settings.scan.concurrency).toBe(9);
    expect(settings.scan.timeoutMs).toBe(defaultSettings().scan.timeoutMs);
  });
});

describe('saveSettings / resetSettings', () => {
  it('保存后可读回', async () => {
    await saveSettings({ dashboard: { cardSize: 'lg' } });
    expect((await loadSettings()).dashboard.cardSize).toBe('lg');
  });

  it('resetSettings 恢复全部默认值', async () => {
    await saveSettings({ theme: 'light', search: { maxResults: 5 }, tags: { x: ['t'] } });
    const reset = await resetSettings();
    expect(reset).toEqual(defaultSettings());
    expect(await loadSettings()).toEqual(defaultSettings());
  });
});

describe('rememberQuery', () => {
  it('新查询插入最前并去重', async () => {
    await rememberQuery('a');
    await rememberQuery('b');
    await rememberQuery('a');
    expect((await loadSettings()).recentQueries).toEqual(['a', 'b']);
  });

  it('最多保留 8 条', async () => {
    for (let i = 0; i < 10; i += 1) await rememberQuery(`q${i}`);
    const recent = (await loadSettings()).recentQueries;
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('q9');
  });

  it('空白查询不写入', async () => {
    await rememberQuery('  ');
    expect((await loadSettings()).recentQueries).toEqual([]);
  });
});

describe('setTags', () => {
  it('写入标签：去空白、去重、去空串', async () => {
    await setTags('b1', [' 前端 ', '前端', '', '  ', 'react']);
    expect((await loadSettings()).tags.b1).toEqual(['前端', 'react']);
  });

  it('清空标签时删除映射而不是留空数组', async () => {
    await setTags('b1', ['a']);
    await setTags('b1', []);
    const tags = (await loadSettings()).tags;
    expect(tags.b1).toBeUndefined();
    expect(Object.keys(tags)).toHaveLength(0);
  });
});

describe('settings 形状防御（v2 R4.7）', () => {
  it('dashboard.tabs 等非法形状回退默认，不产生白屏', async () => {
    await getBackend().storageSet(SETTINGS_KEY, {
      dashboard: { tabs: null, activeTabId: 'ghost', background: { type: 'image' } },
      tags: 'not-object',
      recentQueries: 'not-array',
    });
    const settings = await loadSettings();
    expect(Array.isArray(settings.dashboard.tabs)).toBe(true);
    expect(settings.dashboard.tabs.length).toBeGreaterThan(0);
    expect(settings.dashboard.tabs.some((tab) => tab.id === settings.dashboard.activeTabId)).toBe(true);
    expect(['aurora', 'solid', 'image']).toContain(settings.dashboard.background.type);
    expect(settings.tags).toEqual({});
    expect(settings.recentQueries).toEqual([]);
  });

  it('tabs 内单个非法元素被剔除，合法项保留', async () => {
    await getBackend().storageSet(SETTINGS_KEY, {
      dashboard: {
        tabs: [
          { id: 't1', name: '工作', folderIds: ['1'] },
          null,
          { id: 't2' },
          { id: 't3', name: '学习', folderIds: 'bad' },
        ],
        activeTabId: 't1',
      },
    });
    const settings = await loadSettings();
    expect(settings.dashboard.tabs.map((tab) => tab.id)).toEqual(['t1']);
    expect(settings.dashboard.activeTabId).toBe('t1');
  });

  it('viewBarOpen 非布尔值回退 false，真值保留', async () => {
    await getBackend().storageSet(SETTINGS_KEY, {
      dashboard: { ...defaultSettings().dashboard, viewBarOpen: 'yes' },
    });
    expect((await loadSettings()).dashboard.viewBarOpen).toBe(false);

    await getBackend().storageSet(SETTINGS_KEY, {
      dashboard: { ...defaultSettings().dashboard, viewBarOpen: true },
    });
    expect((await loadSettings()).dashboard.viewBarOpen).toBe(true);
  });
});

describe('设置版本与并发写（2026-11-11 优化）', () => {
  it('无 version 的旧存储补齐版本并保留用户设置', async () => {
    await getBackend().storageSet(SETTINGS_KEY, { theme: 'light', search: { maxResults: 7 } });
    const settings = await loadSettings();
    expect(settings.version).toBe(1);
    expect(settings.theme).toBe('light');
    expect(settings.search.maxResults).toBe(7);
  });

  it('高于当前版本的存储回退默认，避免旧代码误写破坏新结构', async () => {
    await getBackend().storageSet(SETTINGS_KEY, { version: 99, theme: 'light' });
    expect(await loadSettings()).toEqual(defaultSettings());
  });

  it('并发写入不互相覆盖：标签、查询与主题全部保留', async () => {
    await Promise.all([
      setTags('b1', ['x']),
      setTags('b2', ['y']),
      rememberQuery('hello'),
      saveSettings({ theme: 'light' }),
    ]);
    const settings = await loadSettings();
    expect(settings.tags).toEqual({ b1: ['x'], b2: ['y'] });
    expect(settings.recentQueries).toEqual(['hello']);
    expect(settings.theme).toBe('light');
  });
});
