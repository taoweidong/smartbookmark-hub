import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FolderPlus,
  Plus,
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  FolderInput,
  CheckSquare,
  X,
  Layers,
  Bookmark as BookmarkIcon,
} from 'lucide-react';
import { getBackend } from '@/core/backend';
import { bookmarkService, bookmarksInFolder, findNode } from '@/core/bookmarks';
import { store, useApp } from '@/core/store';
import { formatDate } from '@/core/format';
import { canonicalUrl, displayUrl, hostOf } from '@/core/url';
import type { FlatBookmark, LinkHealth } from '@/core/types';
import { SPECIAL_FOLDER_IDS } from '@/core/constants';
import { TreeView, DRAG_MIME } from '@/ui/components/TreeView';
import { Modal, type ConfirmRequest } from '@/ui/components/Modal';
import { EmptyState } from '@/ui/components/Feedback';
import { Favicon } from '@/ui/components/Favicon';
import { folderHue } from '@/ui/folderHue';
import { useSafeDelete } from '@/ui/hooks/useSafeDelete';
import { deleteWithUndo, restoreBatch } from '@/core/trash';
import type { EditorTarget } from '@/ui/components/BookmarkEditor';

const ROW_HEIGHT = 50;
const SORTS = [
  { value: 'default', label: '原始顺序' },
  { value: 'title', label: '标题' },
  { value: 'recent', label: '最近添加' },
  { value: 'host', label: '站点' },
] as const;

type SortKey = (typeof SORTS)[number]['value'];
type StatusFilter = 'all' | 'dead' | 'issue' | 'ok' | 'unknown';

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  dead: 'var(--danger)',
  blocked: 'var(--warn)',
  error: 'var(--warn)',
  timeout: 'var(--warn)',
};

export function BookmarksView({
  health,
  onEdit,
  requestConfirm,
}: {
  health: Map<string, LinkHealth>;
  onEdit(target: EditorTarget): void;
  requestConfirm(request: ConfirmRequest): void;
}) {
  const tree = useApp((state) => state.tree);
  const folders = useApp((state) => state.folders);
  const tags = useApp((state) => state.settings.tags);
  const selectedIds = useApp((state) => state.selectedIds);
  const loading = useApp((state) => state.loading);

  const [activeId, setActiveId] = useState('1');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [recursive, setRecursive] = useState(true);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename'; id?: string; name: string } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('1');
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const lastClicked = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const safeDelete = useSafeDelete(requestConfirm);

  const currentFolder = folders.find((folder) => folder.id === activeId) ?? folders[0];
  const folderId = currentFolder?.id ?? '1';

  const rows = useMemo(() => {
    const source = recursive
      ? bookmarksInFolder(tree, folderId)
      : (findNode(tree, folderId)?.children ?? [])
          .filter((node) => node.url)
          .map((node) => ({
            id: node.id,
            title: node.title || hostOf(node.url ?? ''),
            url: node.url ?? '',
            parentId: folderId,
            folderPath: currentFolder?.path ?? [],
            dateAdded: node.dateAdded ?? 0,
          }));

    const lower = filter.trim().toLowerCase();
    let items = lower
      ? source.filter(
          (item) =>
            item.title.toLowerCase().includes(lower) ||
            item.url.toLowerCase().includes(lower) ||
            (tags[item.id] ?? []).some((tag) => tag.toLowerCase().includes(lower)),
        )
      : [...source];

    if (status !== 'all') {
      items = items.filter((item) => {
        const entry = health.get(canonicalUrl(item.url));
        if (status === 'unknown') return !entry;
        if (status === 'dead') return entry?.status === 'dead';
        if (status === 'ok') return entry?.status === 'ok';
        return entry ? ['dead', 'blocked', 'error', 'timeout'].includes(entry.status) : false;
      });
    }

    if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
    if (sort === 'recent') items.sort((a, b) => b.dateAdded - a.dateAdded);
    if (sort === 'host') items.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)));
    return items;
  }, [tree, folderId, recursive, filter, sort, status, tags, health, currentFolder]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const clickRow = (bookmark: FlatBookmark, event: React.MouseEvent) => {
    if (event.shiftKey && lastClicked.current) {
      const from = rows.findIndex((row) => row.id === lastClicked.current);
      const to = rows.findIndex((row) => row.id === bookmark.id);
      if (from >= 0 && to >= 0) {
        const range = rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((row) => row.id);
        store.getState().selectMany([...selectedIds, ...range]);
        return;
      }
    }
    lastClicked.current = bookmark.id;
    store.getState().toggleSelected(bookmark.id, true);
  };

  const deleteBookmarks = (items: FlatBookmark[]) => {
    safeDelete(
      items.map((item) => item.id),
      items.slice(0, 60).map((item) => ({ title: item.title, detail: displayUrl(item.url) })),
      '删除书签',
    );
  };

  const moveSelected = async () => {
    const ids = [...selected];
    setMoveOpen(false);
    await store.getState().mutate(`已移动 ${ids.length} 项`, async () => {
      for (const id of ids) await bookmarkService.move(id, { parentId: moveTarget });
    });
    store.getState().clearSelection();
  };

  const dropOnFolder = (dragId: string, targetId: string) => {
    void store.getState().mutate('已移动', async () => {
      await bookmarkService.move(dragId, { parentId: targetId });
    });
  };

  const dropOnRow = (dragId: string, target: FlatBookmark) => {
    if (dragId === target.id) return;
    void store.getState().mutate('已调整位置', async () => {
      const siblings = (findNode(tree, target.parentId)?.children ?? []).filter((node) => node.url);
      const position = siblings.findIndex((node) => node.id === target.id);
      await bookmarkService.move(dragId, { parentId: target.parentId, index: Math.max(0, position) });
    });
  };

  const saveFolderDialog = async () => {
    if (!folderDialog) return;
    const name = folderDialog.name.trim();
    if (!name) return;
    const dialog = folderDialog;
    setFolderDialog(null);
    await store.getState().mutate(dialog.mode === 'create' ? '已新建文件夹' : '已重命名', async () => {
      if (dialog.mode === 'create') await bookmarkService.create({ parentId: folderId, title: name });
      else if (dialog.id) await bookmarkService.update(dialog.id, { title: name });
    });
  };

  const deleteFolder = () => {
    if (!currentFolder || currentFolder.special) return;
    const items = bookmarksInFolder(tree, currentFolder.id);
    requestConfirm({
      title: `删除文件夹「${currentFolder.title}」`,
      description: `连同其中 ${items.length} 条书签一起移入回收站。`,
      items: [{ title: currentFolder.path.join(' / '), detail: `${items.length} 条书签`, tone: 'danger' }],
      confirmLabel: '删除文件夹',
      danger: true,
      async onConfirm() {
        try {
          const batch = await deleteWithUndo([currentFolder.id], '删除文件夹');
          await store.getState().refresh();
          setActiveId('1');
          store.getState().pushToast({
            message: '文件夹已移入回收站',
            tone: 'warning',
            undo: () => {
              void restoreBatch(batch.id).then(() => store.getState().refresh());
            },
          });
        } catch (error) {
          store.getState().pushToast({
            message: error instanceof Error ? error.message : '删除失败',
            tone: 'danger',
          });
        }
      },
    });
  };

  return (
    <div className="flex h-full gap-3.5 p-3.5">
      <aside className="panel hidden w-[238px] shrink-0 flex-col md:flex">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Layers size={13} className="text-accent" aria-hidden="true" />
          <span className="display text-[13px] text-text">文件夹</span>
          <button
            type="button"
            className="icon-btn ml-auto h-6 w-6"
            aria-label="新建文件夹"
            title="在当前文件夹下新建"
            onClick={() => setFolderDialog({ mode: 'create', name: '' })}
          >
            <FolderPlus size={13} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <TreeView tree={tree} activeId={folderId} onSelect={setActiveId} onDropInto={dropOnFolder} />
        </div>
        <div className="flex items-center gap-1 border-t border-line px-2 py-2">
          <button
            type="button"
            className="btn btn-sm flex-1"
            disabled={!currentFolder}
            onClick={() => setFolderDialog({ mode: 'rename', id: folderId, name: currentFolder?.title ?? '' })}
          >
            <Pencil size={11} aria-hidden="true" />
            重命名
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={!currentFolder || SPECIAL_FOLDER_IDS.includes(folderId)}
            title={SPECIAL_FOLDER_IDS.includes(folderId) ? '浏览器原生文件夹不可删除' : '删除文件夹'}
            onClick={deleteFolder}
          >
            <Trash2 size={11} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: folderHue(folderId) }} aria-hidden="true" />
          <h2 className="display clamp-1 text-[14px] text-text">{currentFolder?.path.join(' / ') ?? '书签栏'}</h2>
          <span className="mono text-[11px] text-text-faint">{rows.length}</span>
          <select
            className="input ml-auto w-auto py-[3px] text-[12px] md:hidden"
            aria-label="选择文件夹"
            value={folderId}
            onChange={(event) => setActiveId(event.target.value)}
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path.join(' / ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={recursive}
            onClick={() => setRecursive((value) => !value)}
            style={recursive ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            含子文件夹
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onEdit({ mode: 'create', parentId: folderId })}>
            <Plus size={12} aria-hidden="true" />
            新建书签
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <div className="relative min-w-[150px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
            <input
              className="input py-[5px] pl-7 text-[12px]"
              placeholder="在当前文件夹内筛选标题、网址或标签"
              aria-label="筛选书签"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <select className="input w-auto py-[4px] text-[12px]" aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select className="input w-auto py-[4px] text-[12px]" aria-label="链接状态筛选" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">全部状态</option>
            <option value="issue">有问题</option>
            <option value="dead">已失效</option>
            <option value="ok">可访问</option>
            <option value="unknown">未检测</option>
          </select>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => (allSelected ? store.getState().clearSelection() : store.getState().selectMany(rows.map((row) => row.id)))}
          >
            <CheckSquare size={12} aria-hidden="true" />
            {allSelected ? '取消全选' : '全选'}
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
            <span className="mono text-[12px] font-bold text-accent">已选 {selected.size} 项</span>
            <button type="button" className="btn btn-sm" onClick={() => setMoveOpen(true)}>
              <FolderInput size={12} aria-hidden="true" />
              移动到…
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => deleteBookmarks(rows.filter((row) => selected.has(row.id)))}
            >
              <Trash2 size={12} aria-hidden="true" />
              删除
            </button>
            <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={() => store.getState().clearSelection()}>
              <X size={12} aria-hidden="true" />
              清除选择
            </button>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="skeleton h-[42px]" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<BookmarkIcon size={20} aria-hidden="true" />}
              title={filter || status !== 'all' ? '没有符合条件的书签' : '这个文件夹是空的'}
              description={
                filter || status !== 'all'
                  ? '换个关键词，或把状态筛选改回「全部状态」。'
                  : '新建一条书签，或从左侧把其他文件夹里的书签拖进来。'
              }
              action={
                <button type="button" className="btn btn-primary" onClick={() => onEdit({ mode: 'create', parentId: folderId })}>
                  <Plus size={13} aria-hidden="true" />
                  新建书签
                </button>
              }
            />
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtual) => {
                const bookmark = rows[virtual.index];
                const entry = health.get(canonicalUrl(bookmark.url));
                const isSelected = selected.has(bookmark.id);
                const rowTags = tags[bookmark.id] ?? [];
                return (
                  <div
                    key={bookmark.id}
                    className="absolute inset-x-0 flex items-center gap-2.5 border-b border-line px-3 transition-colors duration-100"
                    style={{
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtual.start}px)`,
                      background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
                      borderTop: dropIndex === virtual.index ? '2px solid var(--accent)' : undefined,
                    }}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_MIME, bookmark.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
                      event.preventDefault();
                      setDropIndex(virtual.index);
                    }}
                    onDragLeave={() => setDropIndex((current) => (current === virtual.index ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropIndex(null);
                      const dragId = event.dataTransfer.getData(DRAG_MIME);
                      if (dragId) dropOnRow(dragId, bookmark);
                    }}
                    onDoubleClick={() => onEdit({ mode: 'edit', bookmark })}
                  >
                    <input
                      type="checkbox"
                      className="sbh-check shrink-0"
                      style={{ opacity: 1, accentColor: 'var(--accent)' }}
                      checked={isSelected}
                      aria-label={`选择 ${bookmark.title}`}
                      onClick={(event) => clickRow(bookmark, event)}
                      onChange={() => {}}
                    />
                    <Favicon url={bookmark.url} title={bookmark.title} size={18} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onEdit({ mode: 'edit', bookmark })}
                      title={`${bookmark.title}\n${bookmark.url}`}
                    >
                      <span className="clamp-1 block text-[12.5px] text-text">{bookmark.title}</span>
                      <span className="mono clamp-1 block text-[10.5px] text-text-faint">
                        {recursive && bookmark.folderPath.length > (currentFolder?.path.length ?? 0)
                          ? `${bookmark.folderPath.join(' / ')} · `
                          : ''}
                        {displayUrl(bookmark.url)}
                      </span>
                    </button>
                    {rowTags.slice(0, 2).map((tag) => (
                      <span key={tag} className="chip hidden shrink-0 lg:inline-flex">
                        {tag}
                      </span>
                    ))}
                    {entry && (
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: STATUS_COLOR[entry.status] ?? 'var(--text-faint)' }}
                        title={entry.message ?? entry.status}
                        aria-label={entry.message ?? entry.status}
                      />
                    )}
                    <span className="mono hidden w-[78px] shrink-0 text-right text-[10.5px] text-text-faint xl:block">
                      {formatDate(bookmark.dateAdded)}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="icon-btn h-6 w-6"
                        aria-label={`打开 ${bookmark.title}`}
                        onClick={() => void getBackend().openUrl(bookmark.url, 'newTab')}
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-6 w-6"
                        aria-label={`编辑 ${bookmark.title}`}
                        onClick={() => onEdit({ mode: 'edit', bookmark })}
                      >
                        <Pencil size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-6 w-6 hover:!text-danger"
                        aria-label={`删除 ${bookmark.title}`}
                        onClick={() => deleteBookmarks([bookmark])}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[10.5px] text-text-faint">
          <span className="mono">共 {rows.length} 条</span>
          <span>拖拽书签到左侧文件夹可移动，拖到另一行可调整顺序</span>
          <span className="mono ml-auto">Shift 点击可范围选择</span>
        </footer>
      </section>

      <Modal
        open={Boolean(folderDialog)}
        title={folderDialog?.mode === 'create' ? '新建文件夹' : '重命名文件夹'}
        subtitle={folderDialog?.mode === 'create' ? `创建在「${currentFolder?.title ?? '书签栏'}」下` : undefined}
        onClose={() => setFolderDialog(null)}
        width={400}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFolderDialog(null)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" disabled={!folderDialog?.name.trim()} onClick={() => void saveFolderDialog()}>
              保存
            </button>
          </>
        }
      >
        <input
          className="input"
          autoFocus
          aria-label="文件夹名称"
          value={folderDialog?.name ?? ''}
          placeholder="例如：设计参考"
          onChange={(event) => setFolderDialog((current) => (current ? { ...current, name: event.target.value } : current))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void saveFolderDialog();
          }}
        />
      </Modal>

      <Modal
        open={moveOpen}
        title={`移动 ${selected.size} 项`}
        subtitle="选择目标文件夹，原生书签栏会同步更新。"
        onClose={() => setMoveOpen(false)}
        width={420}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setMoveOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void moveSelected()}>
              <FolderInput size={13} aria-hidden="true" />
              移动
            </button>
          </>
        }
      >
        <select className="input" aria-label="目标文件夹" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {'　'.repeat(Math.min(folder.depth, 4))}
              {folder.path.join(' / ')}
            </option>
          ))}
        </select>
      </Modal>
    </div>
  );
}