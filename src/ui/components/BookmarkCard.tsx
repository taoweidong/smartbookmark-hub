import { Pencil, Trash2, ExternalLink, Tag, AlertTriangle, ShieldQuestion } from 'lucide-react';
import type { FlatBookmark, LinkStatus } from '@/core/types';
import { displayUrl } from '@/core/url';
import { timeAgo } from '@/core/format';
import { Favicon } from './Favicon';

const HEALTH: Partial<Record<LinkStatus, { color: string; label: string }>> = {
  dead: { color: 'var(--danger)', label: '链接失效' },
  blocked: { color: 'var(--warn)', label: '需要登录或拒绝访问' },
  error: { color: 'var(--warn)', label: '检测异常' },
  timeout: { color: 'var(--warn)', label: '响应超时' },
};

export interface BookmarkCardProps {
  bookmark: FlatBookmark;
  hue: string;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'grid' | 'list';
  tags?: string[];
  status?: LinkStatus;
  selected?: boolean;
  selectable?: boolean;
  onOpen(bookmark: FlatBookmark, newTab: boolean): void;
  onEdit?(bookmark: FlatBookmark): void;
  onDelete?(bookmark: FlatBookmark): void;
  onSelect?(id: string, additive: boolean): void;
}

export function BookmarkCard({
  bookmark,
  hue,
  size = 'md',
  layout = 'grid',
  tags = [],
  status,
  selected = false,
  selectable = false,
  onOpen,
  onEdit,
  onDelete,
  onSelect,
}: BookmarkCardProps) {
  const health = status ? HEALTH[status] : undefined;
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 30 : 22;
  const list = layout === 'list';

  return (
    <div
      className="bookmark-card group"
      data-selected={selected}
      style={{
        ['--folder-hue' as string]: hue,
        flexDirection: list ? 'row' : 'column',
        alignItems: list ? 'center' : 'stretch',
        gap: list ? 11 : 8,
        padding: size === 'sm' ? '9px 10px 9px 13px' : list ? '9px 12px 9px 15px' : '12px 13px 11px 16px',
        borderColor: selected ? hue : undefined,
        background: selected ? `color-mix(in srgb, ${hue} 12%, var(--surface))` : undefined,
      }}
      onClick={(event) => {
        if (selectable && (event.ctrlKey || event.metaKey || event.shiftKey)) {
          onSelect?.(bookmark.id, true);
          return;
        }
        onOpen(bookmark, event.ctrlKey || event.metaKey || event.button === 1);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          onOpen(bookmark, true);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(bookmark, event.ctrlKey || event.metaKey);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`打开 ${bookmark.title}`}
      title={`${bookmark.title}\n${bookmark.url}`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`选择 ${bookmark.title}`}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onSelect?.(bookmark.id, true)}
          className="sbh-check absolute right-2 top-2 z-10"
          style={{ accentColor: hue, opacity: selected ? 1 : undefined }}
        />
      )}

      <div className={`flex min-w-0 items-start gap-2.5 ${list ? 'flex-1 items-center' : ''}`}>
        <Favicon url={bookmark.url} title={bookmark.title} size={iconSize} radius={size === 'lg' ? 7 : 5} />
        <div className="min-w-0 flex-1">
          <div
            className={`clamp-2 font-semibold leading-snug text-text ${
              size === 'sm' ? 'text-[12px]' : size === 'lg' ? 'text-[14.5px]' : 'text-[13px]'
            }`}
          >
            {bookmark.title}
          </div>
          <div className="mono clamp-1 mt-0.5 text-[10.5px] text-text-faint">{displayUrl(bookmark.url)}</div>
        </div>
        {health && (
          <span title={health.label} className="mt-[2px] shrink-0" style={{ color: health.color }}>
            {status === 'dead' ? <AlertTriangle size={13} aria-label={health.label} /> : <ShieldQuestion size={13} aria-label={health.label} />}
          </span>
        )}
      </div>

      <div className={`flex items-center gap-1.5 ${list ? 'shrink-0' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-1">
          {tags.slice(0, size === 'sm' ? 1 : 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-[1px] text-[10px] font-semibold"
              style={{ background: `color-mix(in srgb, ${hue} 16%, transparent)`, color: hue }}
            >
              <Tag size={8} aria-hidden="true" />
              {tag}
            </span>
          ))}
          {!list && size !== 'sm' && !tags.length && (
            <span className="text-[10.5px] text-text-faint">{timeAgo(bookmark.dateAdded)}</span>
          )}
        </div>

        <div className={`card-actions flex shrink-0 items-center gap-0.5 ${selectable ? 'mr-5' : ''}`}>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            aria-label={`在新标签页打开 ${bookmark.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(bookmark, true);
            }}
          >
            <ExternalLink size={12} aria-hidden="true" />
          </button>
          {onEdit && (
            <button
              type="button"
              className="icon-btn h-6 w-6"
              aria-label={`编辑 ${bookmark.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(bookmark);
              }}
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="icon-btn h-6 w-6 hover:!text-danger"
              aria-label={`删除 ${bookmark.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(bookmark);
              }}
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}