import { useEffect, useState } from 'react';
import { Bookmark, Sparkles, Archive, Settings2, LayoutDashboard, Search, ShieldCheck } from 'lucide-react';
import { useApp } from '@/core/store';
import { Brand } from '@/ui/components/Brand';
import { ThemeToggle } from '@/ui/components/ThemeToggle';
import { Toasts } from '@/ui/components/Toasts';
import { ConfirmDialog, type ConfirmRequest } from '@/ui/components/Modal';
import { BookmarkEditor, type EditorTarget } from '@/ui/components/BookmarkEditor';
import { useBootstrap } from '@/ui/hooks/useBootstrap';
import { useHealth } from '@/ui/hooks/useHealth';
import { useSafeDelete } from '@/ui/hooks/useSafeDelete';
import { canonicalUrl } from '@/core/url';
import { BookmarksView } from './BookmarksView';
import { CleanerView } from './CleanerView';
import { BackupView } from './BackupView';
import { SettingsView } from './SettingsView';

const VIEWS = [
  { key: 'bookmarks', label: '书签管理', title: '书签管理', hint: '新建、重命名、拖拽移动与批量删除，改动会同步到原生书签栏', Icon: Bookmark },
  { key: 'cleaner', label: '智能清理', title: '智能清理', hint: '失效链接、重复书签与空文件夹，删除前一律预览确认', Icon: Sparkles },
  { key: 'backup', label: '备份与回收站', title: '备份与回收站', hint: '标准 HTML 导出、导入，以及最近 20 批删除的恢复', Icon: Archive },
  { key: 'settings', label: '设置', title: '设置', hint: '外观、搜索、快捷键与本机数据', Icon: Settings2 },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

function readView(): ViewKey {
  const hash = window.location.hash.replace('#', '');
  return VIEWS.some((view) => view.key === hash) ? (hash as ViewKey) : 'bookmarks';
}

export default function App() {
  useBootstrap();
  const { health, reload } = useHealth();
  const [view, setView] = useState<ViewKey>(readView);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const totalCount = useApp((state) => state.totalCount);
  const folderCount = useApp((state) => state.folders.length);
  const demo = useApp((state) => state.demo);
  const safeDelete = useSafeDelete(setConfirm);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (key: ViewKey) => {
    window.location.hash = key;
    setView(key);
  };

  const current = VIEWS.find((item) => item.key === view) ?? VIEWS[0];

  const openHub = (search: boolean) => {
    const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?(message: unknown): void } } }).chrome?.runtime;
    if (runtime?.sendMessage) runtime.sendMessage({ type: 'sbh:open-hub', focusSearch: search });
    else window.open(search ? 'newtab.html#search' : 'newtab.html', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative flex h-full">
      <div className="aurora-layer" style={{ opacity: 0.35 }} aria-hidden="true" />
      <div className="grain-layer" aria-hidden="true" />

      <nav className="relative z-20 hidden w-[196px] shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur-sm md:flex" aria-label="管理台导航">
        <div className="border-b border-line px-3.5 py-3">
          <Brand size={28} />
        </div>
        <div className="flex-1 space-y-0.5 p-2">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="tree-row w-full"
              data-active={view === item.key}
              aria-current={view === item.key ? 'page' : undefined}
              onClick={() => go(item.key)}
            >
              <item.Icon size={14} className="shrink-0" style={{ color: view === item.key ? 'var(--accent)' : 'var(--text-faint)' }} aria-hidden="true" />
              <span className="flex-1 text-left text-[12.5px]">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t border-line p-2.5">
          <button type="button" className="btn btn-sm w-full justify-start" onClick={() => openHub(false)}>
            <LayoutDashboard size={12} aria-hidden="true" />
            打开书签首页
          </button>
          <div className="mono flex items-center justify-between px-1 text-[10.5px] text-text-faint">
            <span>{totalCount} 条书签</span>
            <span>{folderCount} 文件夹</span>
          </div>
          <div className="flex items-center gap-1.5 px-1 text-[10.5px] text-text-faint">
            <ShieldCheck size={11} className="text-ok" aria-hidden="true" />
            数据仅存本机
          </div>
        </div>
      </nav>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-bg/70 px-3.5 py-2.5 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <h1 className="display text-[16px] leading-tight text-text">{current.title}</h1>
            <p className="clamp-1 text-[11.5px] text-text-faint">{current.hint}</p>
          </div>
          <select
            className="input w-auto py-[4px] text-[12px] md:hidden"
            aria-label="切换视图"
            value={view}
            onChange={(event) => go(event.target.value as ViewKey)}
          >
            {VIEWS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={() => openHub(true)}>
            <Search size={12} aria-hidden="true" />
            <span className="hidden sm:inline">全局搜索</span>
          </button>
          <ThemeToggle />
        </header>

        {demo && (
          <p className="flex-none border-b border-line bg-surface px-3.5 py-1.5 text-[11px] text-text-faint">
            网页预览模式：示例书签，检测使用模拟响应。加载为 Chrome 扩展后即为真实数据。
          </p>
        )}

        <main className="relative min-h-0 flex-1">
          {view === 'bookmarks' && <BookmarksView health={health} onEdit={setEditor} requestConfirm={setConfirm} />}
          {view === 'cleaner' && <CleanerView requestConfirm={setConfirm} onHealthChanged={reload} />}
          {view === 'backup' && <BackupView requestConfirm={setConfirm} />}
          {view === 'settings' && <SettingsView requestConfirm={setConfirm} />}
        </main>
      </div>

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