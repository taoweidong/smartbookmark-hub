import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Settings2, LayoutDashboard, Sparkles, History, ChevronRight } from 'lucide-react';
import { getBackend } from '@/core/backend';
import { bookmarkService } from '@/core/bookmarks';
import { store, useApp } from '@/core/store';
import { timeAgo } from '@/core/format';
import { displayUrl } from '@/core/url';
import { BrandMark } from '@/ui/components/Brand';
import { SearchBox } from '@/ui/components/SearchBox';
import { ThemeToggle } from '@/ui/components/ThemeToggle';
import { Toasts } from '@/ui/components/Toasts';
import { Favicon } from '@/ui/components/Favicon';
import { openWithFeedback } from '@/ui/openWithFeedback';
import { useBootstrap } from '@/ui/hooks/useBootstrap';
import { useSearch } from '@/ui/hooks/useSearch';
import { folderHue } from '@/ui/folderHue';

export default function App() {
  useBootstrap();
  const search = useSearch();
  const { focus } = search;
  const flat = useApp((state) => state.flat);
  const loading = useApp((state) => state.loading);
  const recentQueries = useApp((state) => state.settings.recentQueries);
  const includeHistory = useApp((state) => state.settings.search.includeHistory);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.setTimeout(() => focus(), 40);
  }, [focus]);

  const recent = useMemo(() => [...flat].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 6), [flat]);

  const saveCurrent = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const page = await getBackend().currentTab();
      if (!page?.url || !/^https?:/i.test(page.url)) {
        store.getState().pushToast({ message: '当前页面不是可收藏的网页', tone: 'warning' });
        return;
      }
      const created = await bookmarkService.create({ parentId: '1', title: page.title || page.url, url: page.url });
      await store.getState().refresh();
      store.getState().pushToast({
        message: '已收藏到书签栏',
        tone: 'success',
        undo: () => {
          void bookmarkService.remove(created.id).then(() => store.getState().refresh());
        },
      });
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '收藏失败',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <div className="aurora-layer" style={{ opacity: 0.5 }} aria-hidden="true" />
      <div className="grain-layer" aria-hidden="true" />

      <header className="relative z-20 flex-none border-b border-line px-3 py-2.5">
        <div className="mx-auto w-full max-w-[900px]">
          <div className="mb-2 flex items-center gap-2">
            <BrandMark size={22} />
            <span className="display text-[13px] text-text">快捷搜索</span>
            <span className="mono ml-auto text-[9.5px] tracking-[0.1em] text-text-faint">
              书签 › {includeHistory ? '历史 › ' : ''}网页
            </span>
            <ThemeToggle />
          </div>
          <SearchBox controller={search} size="sm" placeholder="书签 / 拼音首字母 / 网址 / 标签" />
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-[1_1_auto] overflow-y-auto px-3 py-2.5">
        <div className="mx-auto w-full max-w-[900px]">
          {search.query.trim() ? (
            search.open ? (
              <p className="px-1 py-3 text-[12px] text-text-faint">结果已在上方展开，用 ↑↓ 选择，Enter 新标签页打开。</p>
            ) : (
              <button type="button" className="btn btn-sm w-full" onClick={() => search.setOpen(true)}>
                展开 {search.results.length} 条结果
              </button>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <button type="button" className="btn btn-primary justify-start" disabled={saving} onClick={() => void saveCurrent()}>
                  <BookmarkPlus size={13} aria-hidden="true" />
                  {saving ? '收藏中…' : '收藏当前页'}
                </button>
                <button type="button" className="btn justify-start" onClick={() => void getBackend().openOptions()}>
                  <Settings2 size={13} aria-hidden="true" />
                  管理台
                </button>
                <button
                  type="button"
                  className="btn col-span-2 justify-start"
                  onClick={() => void getBackend().openHub(false)}
                >
                  <LayoutDashboard size={13} aria-hidden="true" />
                  打开书签首页
                  <ChevronRight size={12} className="ml-auto" aria-hidden="true" />
                </button>
              </div>

              {recentQueries.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <History size={11} className="text-text-faint" aria-hidden="true" />
                    <span className="label">最近搜索</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentQueries.slice(0, 6).map((query) => (
                      <button key={query} type="button" className="chip hover:text-accent" onClick={() => search.change(query)}>
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-accent" aria-hidden="true" />
                  <span className="label">最近添加</span>
                  <span className="mono ml-auto text-[10px] text-text-faint">{flat.length}</span>
                </div>
                {loading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div key={index} className="skeleton h-[38px]" />
                    ))}
                  </div>
                ) : recent.length ? (
                  <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-2 sm:gap-1.5 xl:grid-cols-3">
                    {recent.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        type="button"
                        className="result-row"
                        onClick={() => void openWithFeedback(bookmark.url)}
                        title={bookmark.url}
                      >
                        <Favicon url={bookmark.url} title={bookmark.title} size={18} />
                        <span className="min-w-0 flex-1">
                          <span className="clamp-1 block text-[12px] text-text-dim">{bookmark.title}</span>
                          <span className="mono clamp-1 block text-[10px] text-text-faint">{displayUrl(bookmark.url)}</span>
                        </span>
                        <span
                          className="mono shrink-0 text-[9.5px]"
                          style={{ color: folderHue(bookmark.parentId) }}
                        >
                          {timeAgo(bookmark.dateAdded)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-3 text-[12px] text-text-faint">还没有书签，先收藏当前页面试试。</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="relative z-10 flex-none border-t border-line px-3 py-1.5">
        <span className="mono text-[9.5px] text-text-faint">↑↓ 选择 · Enter 新标签页打开 · Esc 关闭</span>
      </footer>

      <Toasts compact />
    </div>
  );
}