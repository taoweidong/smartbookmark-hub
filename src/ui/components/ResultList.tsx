import { useEffect, useRef } from 'react';
import { Bookmark, Clock, Globe, CornerDownLeft, ArrowUpRight } from 'lucide-react';
import type { SearchResult } from '@/core/types';
import { Favicon } from './Favicon';

const GROUP = {
  bookmark: { label: '收藏夹', Icon: Bookmark, color: 'var(--accent)' },
  history: { label: '历史记录', Icon: Clock, color: 'var(--info)' },
  web: { label: '网页搜索', Icon: Globe, color: 'var(--text-faint)' },
} as const;

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-[2px] bg-transparent font-bold" style={{ color: 'var(--accent)' }}>
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function ResultList({
  results,
  query,
  activeIndex,
  compact = false,
  onHover,
  onPick,
}: {
  results: SearchResult[];
  query: string;
  activeIndex: number;
  compact?: boolean;
  onHover(index: number): void;
  onPick(result: SearchResult, newTab: boolean): void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  let lastKind = '';

  return (
    <div ref={listRef} className={`overflow-y-auto ${compact ? 'max-h-[380px]' : 'max-h-[52vh]'}`} role="listbox" aria-label="搜索结果">
      {results.map((result, index) => {
        const group = GROUP[result.kind];
        const header = result.kind !== lastKind;
        lastKind = result.kind;
        const active = index === activeIndex;

        return (
          <div key={result.id}>
            {header && (
              <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-surface-2/95 px-3 py-1.5 backdrop-blur">
                <group.Icon size={11} style={{ color: group.color }} aria-hidden="true" />
                <span className="text-[10.5px] font-bold tracking-[0.06em]" style={{ color: group.color }}>
                  {group.label}
                </span>
                <span className="mono text-[10.5px] text-text-faint">
                  {results.filter((item) => item.kind === result.kind).length}
                </span>
                <span className="ml-1 h-px flex-1" style={{ background: 'var(--line)' }} aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={active}
              data-active={active}
              className="result-row"
              onMouseEnter={() => onHover(index)}
              onClick={(event) => onPick(result, event.ctrlKey || event.metaKey || event.button === 1)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onPick(result, true);
                }
              }}
            >
              {result.kind === 'web' ? (
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-line-strong"
                  aria-hidden="true"
                >
                  <Globe size={12} className="text-text-faint" />
                </span>
              ) : (
                <Favicon url={result.url} title={result.title} size={20} />
              )}
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-[13px] font-medium text-text">
                  <Highlight text={result.title} query={query} />
                </span>
                <span className="mono clamp-1 block text-[11px] text-text-faint">{result.subtitle}</span>
              </span>
              {result.kind !== 'web' && result.matchedOn && (
                <span className="chip hidden shrink-0 sm:inline-flex">{result.matchedOn}</span>
              )}
              {active ? (
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-bold text-accent">
                  <CornerDownLeft size={12} aria-hidden="true" />
                  打开
                </span>
              ) : (
                <ArrowUpRight size={13} className="shrink-0 text-text-faint opacity-0" aria-hidden="true" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}