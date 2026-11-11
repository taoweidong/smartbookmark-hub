import { useEffect, useMemo, useState } from 'react';
import {
  Settings2,
  Bookmark,
  FolderTree,
  Sparkles,
  HeartPulse,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  ChevronDown,
  FolderCog,
} from 'lucide-react';
import { getBackend } from '@/core/backend';
import { formatCount, greeting, weekdayLabel } from '@/core/format';
import { activeTab, store, useApp } from '@/core/store';
import { canonicalUrl } from '@/core/url';
import type { DashboardTab, FlatBookmark } from '@/core/types';
import { Brand } from '@/ui/components/Brand';
import { SearchBox } from '@/ui/components/SearchBox';
import { ThemeToggle } from '@/ui/components/ThemeToggle';
import { Toasts } from '@/ui/components/Toasts';
import { Modal, ConfirmDialog, type ConfirmRequest } from '@/ui/components/Modal';
import { FolderPicker } from '@/ui/components/FolderPicker';
import { BookmarkEditor, type EditorTarget } from '@/ui/components/BookmarkEditor';
import { useBootstrap } from '@/ui/hooks/useBootstrap';
import { useSearch } from '@/ui/hooks/useSearch';
import { useHealth } from '@/ui/hooks/useHealth';
import { useSafeDelete } from '@/ui/hooks/useSafeDelete';
import { BackgroundLayer } from './BackgroundLayer';
import { TabStrip, makeTab } from './TabStrip';
import { DisplayControls } from './DisplayControls';
import { Dashboard } from './Dashboard';

function readHash(): { query: string; focus: boolean } {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('q=')) return { query: decodeURIComponent(hash.slice(2)), focus: true };
  return { query: '', focus: hash === 'search' };
}

function InlineStat({
  icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  hint: string;
}) {
  return (
    <span className="flex items-center gap-1" title={hint}>
      <span style={{ color }} aria-hidden="true">
        {icon}
      </span>
      <span className="text-[10.5px] text-text-faint">{label}</span>
      <span className="mono text-[13px] font-bold leading-none" style={{ color }}>
        {value}
      </span>
    </span>
  );
}

export default function App() {
  useBootstrap();
  const [intent] = useState(readHash);
  const search = useSearch(intent.query);
  const { focus } = search;
  const { health } = useHealth();

  const settings = useApp((state) => state.settings);
  const folders = useApp((state) => state.folders);
  const flat = useApp((state) => state.flat);
  const totalCount = useApp((state) => state.totalCount);
  const demo = useApp((state) => state.demo);
  const error = useApp((state) => state.error);
  const tab = useApp(activeTab);
  const viewBarOpen = useApp((state) => state.settings.dashboard.viewBarOpen);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIds, setPickerIds] = useState<string[]>([]);
  const [tabDialog, setTabDialog] = useState<{ mode: 'add' | 'rename'; id?: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const safeDelete = useSafeDelete(setConfirm);

  useEffect(() => {
    if (intent.focus) window.setTimeout(() => focus(), 60);
  }, [intent.focus, focus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && (key === 'k' || (event.shiftKey && key === 'f'))) {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  const folderIds = useMemo(
    () => (tab?.folderIds ?? []).filter((id) => folders.some((folder) => folder.id === id)),
    [tab, folders],
  );

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86_400_000;
    const recent = flat.filter((item) => item.dateAdded >= week).length;
    let known = 0;
    let ok = 0;
    for (const item of flat) {
      const entry = health.get(canonicalUrl(item.url));
      if (!entry || entry.status === 'skipped') continue;
      known += 1;
      if (entry.status === 'ok') ok += 1;
    }
    const shown = folderIds.reduce((sum, id) => sum + (folders.find((folder) => folder.id === id)?.totalCount ?? 0), 0);
    return { recent, known, ok, shown, rate: known ? Math.round((ok / known) * 100) : null };
  }, [flat, health, folderIds, folders]);

  const toggleViewBar = () => void store.getState().updateSettings({ dashboard: { viewBarOpen: !viewBarOpen } });

  const openPicker = () => {
    setPickerIds(tab?.folderIds ?? []);
    setPickerOpen(true);
  };

  const savePicker = () => {
    if (!tab) return;
    const tabs = settings.dashboard.tabs.map((item) =>
      item.id === tab.id ? { ...item, folderIds: pickerIds } : item,
    );
    void store.getState().updateSettings({ dashboard: { tabs } });
    setPickerOpen(false);
    store.getState().pushToast({ message: `「${tab.name}」现在展示 ${pickerIds.length} 个文件夹`, tone: 'success' });
  };

  const saveTabDialog = () => {
    if (!tabDialog) return;
    const name = tabDialog.name.trim();
    if (!name) return;
    if (tabDialog.mode === 'add') {
      const created = makeTab(name);
      void store.getState().updateSettings({
        dashboard: { tabs: [...settings.dashboard.tabs, created], activeTabId: created.id },
      });
      setPickerIds([]);
      setPickerOpen(true);
    } else {
      const tabs = settings.dashboard.tabs.map((item) =>
        item.id === tabDialog.id ? { ...item, name } : item,
      );
      void store.getState().updateSettings({ dashboard: { tabs } });
    }
    setTabDialog(null);
  };

  const deleteTab = (target: DashboardTab) => {
    setConfirm({
      title: `删除页签「${target.name}」`,
      description: '只移除首页页签配置，文件夹和书签都不会被删除。',
      confirmLabel: '删除页签',
      danger: true,
      onConfirm() {
        const tabs = settings.dashboard.tabs.filter((item) => item.id !== target.id);
        void store.getState().updateSettings({
          dashboard: { tabs, activeTabId: tabs[0]?.id ?? '' },
        });
      },
    });
  };

  const editBookmark = (bookmark: FlatBookmark) => setEditor({ mode: 'edit', bookmark });

  const now = new Date();
  const remaining = Math.max(0, totalCount - stats.shown);

  return (
    <div className="relative flex h-full flex-col">
      <BackgroundLayer />

      <header className="relative z-30 flex-none border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-1.5 lg:gap-4 lg:px-6">
          <Brand size={26} compact className="hidden shrink-0 sm:flex" />
          <div className="mx-auto w-full max-w-[620px]">
            <SearchBox controller={search} autoFocus={intent.focus} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button type="button" className="btn btn-sm" onClick={() => void getBackend().openOptions()}>
              <Settings2 size={13} aria-hidden="true" />
              <span className="hidden sm:inline">管理台</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-1 lg:px-6">
          <TabStrip
            onAdd={() => setTabDialog({ mode: 'add', name: '' })}
            onRename={(target) => setTabDialog({ mode: 'rename', id: target.id, name: target.name })}
            onDelete={deleteTab}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="btn btn-sm"
              aria-label="视图设置"
              aria-expanded={viewBarOpen}
              aria-controls="sbh-view-bar"
              title="布局、卡片、排序、每组数量、背景与主色"
              onClick={toggleViewBar}
              style={viewBarOpen ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
              <span className="hidden lg:inline">视图</span>
              <ChevronDown
                size={11}
                aria-hidden="true"
                className={`transition-transform duration-200 ${viewBarOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={openPicker}>
              <FolderCog size={12} aria-hidden="true" />
              选择文件夹
            </button>
          </div>
        </div>

        {viewBarOpen && <DisplayControls />}
      </header>

      <main id="sbh-scroll" className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="rise-in px-4 pt-2.5 lg:px-6">
          <div
            data-sbh-context
            role="group"
            aria-label="首页概览"
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
          >
            <h1 className="display flex items-baseline gap-2 text-[16px] leading-none text-text">
              {greeting(now)}
              <span className="mono text-[11px] font-normal text-text-faint">
                {now.getMonth() + 1} 月 {now.getDate()} 日 · {weekdayLabel(now)}
              </span>
            </h1>
            <span className="hidden h-3.5 w-px bg-line-strong sm:block" aria-hidden="true" />
            <span className="flex items-center gap-1.5 text-[12px] text-text-faint">
              <span className="font-semibold text-text-dim">{tab?.name ?? '常用'}</span>
              <span className="mono text-text">{folderIds.length}</span> 文件夹
              <span className="text-line-strong" aria-hidden="true">·</span>
              <span className="mono text-text">{stats.shown}</span> 书签
            </span>
            {remaining > 0 && (
              <button
                type="button"
                className="chip transition-colors duration-150 hover:border-accent hover:text-accent"
                aria-label={`其余 ${remaining} 条书签，点击聚焦搜索`}
                title="这些书签不在本页展示，用搜索随时找回"
                onClick={focus}
              >
                其余 <span className="mono text-text-dim">{remaining}</span> 条
                <span className="mono rounded-[3px] border border-line px-1 text-[10px]">⌘K</span>
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              {settings.dashboard.showStats && (
                <>
                  <InlineStat
                    icon={<Bookmark size={11} />}
                    label="书签总数"
                    value={formatCount(totalCount)}
                    color="var(--accent)"
                    hint="浏览器原生收藏夹"
                  />
                  <InlineStat
                    icon={<FolderTree size={11} />}
                    label="文件夹"
                    value={String(folders.length)}
                    color="var(--info)"
                    hint={`本页已选 ${folderIds.length} 个`}
                  />
                  <InlineStat
                    icon={<Sparkles size={11} />}
                    label="近 7 天"
                    value={`+${stats.recent}`}
                    color="var(--ok)"
                    hint="最近收藏的链接"
                  />
                  <InlineStat
                    icon={<HeartPulse size={11} />}
                    label="链接健康度"
                    value={stats.rate === null ? '—' : `${stats.rate}%`}
                    color={stats.rate === null ? 'var(--text-faint)' : stats.rate >= 90 ? 'var(--ok)' : 'var(--warn)'}
                    hint={stats.known ? `已检测 ${stats.known} 条` : '在管理台运行智能清理'}
                  />
                </>
              )}
              <span className="chip" title="所有数据只保存在本机，不上传服务器">
                <ShieldCheck size={11} className="text-ok" aria-hidden="true" />
                仅存本机
              </span>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-[6px] border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          {demo && (
            <p className="mt-3 rounded-[6px] border border-line bg-surface px-3 py-2 text-[12px] text-text-faint">
              当前是网页预览模式，展示一组示例书签。把 dist 目录加载为 Chrome 扩展后，这里会读取你真实的收藏夹。
            </p>
          )}
        </div>

        <Dashboard folderIds={folderIds} health={health} onPickFolders={openPicker} onEdit={editBookmark} />

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-[11px] text-text-faint lg:px-6">
          <span className="mono">Ctrl/⌘ + K 聚焦搜索</span>
          <span className="mono">地址栏输入 bm + 空格 直接搜书签</span>
          <span className="ml-auto">SmartBookmark Hub · 本地优先，不上传任何数据</span>
        </footer>
      </main>

      <Modal
        open={pickerOpen}
        title={`为「${tab?.name ?? '常用'}」选择文件夹`}
        subtitle="勾选后会立即显示在首页，原生收藏夹结构保持不变。"
        onClose={() => setPickerOpen(false)}
        width={560}
        footer={
          <>
            <span className="mono mr-auto text-[12px] text-text-faint">已选 {pickerIds.length} 个</span>
            <button type="button" className="btn" onClick={() => setPickerOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={savePicker}>
              保存到页签
            </button>
          </>
        }
      >
        <FolderPicker folders={folders} selected={pickerIds} onChange={setPickerIds} />
      </Modal>

      <Modal
        open={Boolean(tabDialog)}
        title={tabDialog?.mode === 'add' ? '新建页签' : '重命名页签'}
        subtitle="按场景分开配置，例如工作、学习、娱乐。"
        onClose={() => setTabDialog(null)}
        width={400}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setTabDialog(null)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" disabled={!tabDialog?.name.trim()} onClick={saveTabDialog}>
              <Plus size={13} aria-hidden="true" />
              {tabDialog?.mode === 'add' ? '创建并选择文件夹' : '保存名称'}
            </button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          aria-label="页签名称"
          placeholder="例如：工作"
          value={tabDialog?.name ?? ''}
          onChange={(event) => setTabDialog((current) => (current ? { ...current, name: event.target.value } : current))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') saveTabDialog();
          }}
        />
      </Modal>

      <BookmarkEditor
        target={editor}
        health={editor?.mode === 'edit' ? health.get(canonicalUrl(editor.bookmark.url)) : undefined}
        onClose={() => setEditor(null)}
        onDelete={(bookmark) => {
          setEditor(null);
          safeDelete([bookmark.id], [{ title: bookmark.title, detail: bookmark.url }], '删除书签');
        }}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toasts />
    </div>
  );
}