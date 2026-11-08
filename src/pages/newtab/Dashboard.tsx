import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { getBackend } from '@/core/backend';
import { bookmarksInFolder, type FolderInfo } from '@/core/bookmarks';
import { store, useApp } from '@/core/store';
import type { FlatBookmark, LinkHealth, Settings } from '@/core/types';
import { canonicalUrl, hostOf } from '@/core/url';
import { BookmarkCard } from '@/ui/components/BookmarkCard';
import { EmptyState, SkeletonCards } from '@/ui/components/Feedback';
import { folderHue } from '@/ui/folderHue';
import { FolderRail } from './FolderRail';

function sortItems(items: FlatBookmark[], sort: Settings['dashboard']['sort']): FlatBookmark[] {
  const copy = [...items];
  if (sort === 'recent') copy.sort((a, b) => b.dateAdded - a.dateAdded);
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  if (sort === 'host') copy.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)) || a.title.localeCompare(b.title));
  return copy;
}

function gridTemplate(size: Settings['dashboard']['cardSize'], layout: Settings['dashboard']['layout']): string {
  if (layout === 'list') return '1fr';
  const min = size === 'sm' ? 176 : size === 'lg' ? 288 : 224;
  return `repeat(auto-fill, minmax(${min}px, 1fr))`;
}

export function Dashboard({
  folderIds,
  health,
  onPickFolders,
  onEdit,
}: {
  folderIds: string[];
  health: Map<string, LinkHealth>;
  onPickFolders(): void;
  onEdit(bookmark: FlatBookmark): void;
}) {
  const tree = useApp((state) => state.tree);
  const folders = useApp((state) => state.folders);
  const loading = useApp((state) => state.loading);
  const dashboard = useApp((state) => state.settings.dashboard);
  const tags = useApp((state) => state.settings.tags);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState('');

  const sections = useMemo(() => {
    return folderIds
      .map((id) => folders.find((folder) => folder.id === id))
      .filter((folder): folder is FolderInfo => Boolean(folder))
      .map((folder) => ({
        folder,
        items: sortItems(bookmarksInFolder(tree, folder.id), dashboard.sort),
      }));
  }, [folderIds, folders, tree, dashboard.sort]);

  useEffect(() => {
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.getAttribute('data-folder-id') ?? '');
      },
      { rootMargin: '-20px 0px -55% 0px', threshold: 0 },
    );
    for (const node of document.querySelectorAll('[data-folder-section]')) observer.observe(node);
    return () => observer.disconnect();
  }, [sections]);

  const open = (bookmark: FlatBookmark, newTab: boolean) => {
    void getBackend().openUrl(bookmark.url, newTab ? 'newTab' : 'current').catch((error: unknown) => {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '打开链接失败',
        tone: 'danger',
      });
    });
  };

  const jump = (id: string) => {
    document.getElementById(`folder-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-7">
        <SkeletonCards count={10} />
      </div>
    );
  }

  if (!sections.length) {
    return (
      <EmptyState
        icon={<SlidersHorizontal size={22} aria-hidden="true" />}
        title="这个页签还没有选择文件夹"
        description="勾选浏览器里常用的书签文件夹，它们会按分组展示在这里。原生收藏夹的结构不会被改动。"
        action={
          <button type="button" className="btn btn-primary" onClick={onPickFolders}>
            <FolderOpen size={14} aria-hidden="true" />
            选择文件夹
          </button>
        }
      />
    );
  }

  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <div className="flex gap-6 px-4 py-5 lg:px-7">
      <FolderRail folders={sections.map((section) => section.folder)} activeId={activeId} total={total} onJump={jump} />

      <div className="min-w-0 flex-1 space-y-7">
        {sections.map(({ folder, items }) => {
          const hue = folderHue(folder.id);
          const isExpanded = expanded.has(folder.id);
          const shown = isExpanded ? items : items.slice(0, dashboard.perFolder);
          return (
            <section
              key={folder.id}
              id={`folder-${folder.id}`}
              data-folder-section
              data-folder-id={folder.id}
              style={{ scrollMarginTop: 12 }}
              aria-label={folder.title}
            >
              <header className="mb-2.5 flex items-center gap-2.5">
                <span className="h-[9px] w-[9px] shrink-0 rounded-[2px]" style={{ background: hue }} aria-hidden="true" />
                <h2 className="display text-[15px] text-text">{folder.title}</h2>
                <span className="mono text-[11px] text-text-faint">{items.length}</span>
                {folder.path.length > 1 && (
                  <span className="clamp-1 hidden text-[11px] text-text-faint sm:block">{folder.path.slice(0, -1).join(' / ')}</span>
                )}
                <span className="rule ml-1 hidden h-px flex-1 sm:block" aria-hidden="true" />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost shrink-0"
                  disabled={!items.length}
                  onClick={() => {
                    for (const item of items.slice(0, 10)) void getBackend().openUrl(item.url, 'newTab');
                    store.getState().pushToast({
                      message: `已在新标签页打开 ${Math.min(10, items.length)} 个链接`,
                      tone: 'info',
                    });
                  }}
                >
                  <ExternalLink size={11} aria-hidden="true" />
                  批量打开
                </button>
              </header>

              {items.length ? (
                <>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: gridTemplate(dashboard.cardSize, dashboard.layout) }}>
                    {shown.map((bookmark) => (
                      <BookmarkCard
                        key={bookmark.id}
                        bookmark={bookmark}
                        hue={hue}
                        size={dashboard.cardSize}
                        layout={dashboard.layout}
                        tags={tags[bookmark.id] ?? []}
                        status={health.get(canonicalUrl(bookmark.url))?.status}
                        onOpen={open}
                        onEdit={onEdit}
                      />
                    ))}
                  </div>
                  {items.length > dashboard.perFolder && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost mt-2"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        })
                      }
                    >
                      <ChevronDown size={12} className={isExpanded ? 'rotate-180' : ''} aria-hidden="true" />
                      {isExpanded ? '收起' : `显示全部 ${items.length} 条`}
                    </button>
                  )}
                </>
              ) : (
                <p className="panel px-3 py-4 text-[12.5px] text-text-faint">这个文件夹是空的，可在管理台里添加书签或取消勾选。</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}