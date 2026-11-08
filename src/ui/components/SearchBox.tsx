import { useEffect, useRef } from 'react';
import { Search, X, Loader2, Command } from 'lucide-react';
import { useApp } from '@/core/store';
import type { SearchController } from '../hooks/useSearch';
import { ResultList } from './ResultList';

export function SearchBox({
  controller,
  placeholder = '搜索书签、拼音首字母、网址或标签…',
  size = 'lg',
  autoFocus = false,
}: {
  controller: SearchController;
  placeholder?: string;
  size?: 'lg' | 'sm';
  autoFocus?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const includeHistory = useApp((state) => state.settings.search.includeHistory);
  const recent = useApp((state) => state.settings.recentQueries);
  const { query, results, searching, activeIndex, open, inputRef } = controller;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, inputRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) controller.setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, controller]);

  const bookmarkCount = results.filter((result) => result.kind === 'bookmark').length;
  const historyCount = results.filter((result) => result.kind === 'history').length;
  const large = size === 'lg';

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        className="flex items-center gap-2.5 border bg-surface transition-[border-color,box-shadow] duration-150"
        style={{
          borderRadius: large ? 12 : 8,
          padding: large ? '11px 14px' : '7px 10px',
          borderColor: open ? 'var(--accent)' : 'var(--line-strong)',
          boxShadow: open
            ? '0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent), var(--shadow)'
            : '0 10px 30px -24px rgba(0,0,0,0.9)',
        }}
      >
        {searching ? (
          <Loader2 size={large ? 18 : 15} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
        ) : (
          <Search size={large ? 18 : 15} className="shrink-0 text-accent" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="sbh-results"
          aria-autocomplete="list"
          aria-label="全局搜索"
          value={query}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => controller.change(event.target.value)}
          onFocus={() => {
            if (query.trim()) controller.setOpen(true);
          }}
          onKeyDown={controller.onKeyDown}
          className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-text outline-none placeholder:text-text-faint ${
            large ? 'text-[16px]' : 'text-[13px]'
          }`}
        />
        {query ? (
          <button type="button" className="icon-btn h-6 w-6" aria-label="清空搜索" onClick={controller.clear}>
            <X size={14} aria-hidden="true" />
          </button>
        ) : (
          large && (
            <span className="mono hidden shrink-0 items-center gap-1 rounded-[5px] border border-line px-1.5 py-0.5 text-[10.5px] text-text-faint sm:flex">
              <Command size={10} aria-hidden="true" />K
            </span>
          )
        )}
      </div>

      {open && (
        <div
          id="sbh-results"
          className="rise-in panel-raised absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden"
          style={{ borderRadius: 10 }}
        >
          {results.length ? (
            <>
              <ResultList
                results={results}
                query={query}
                activeIndex={activeIndex}
                compact={size === 'sm'}
                onHover={controller.setActiveIndex}
                onPick={(result, newTab) => void controller.activate(result, newTab ? 'newTab' : 'current')}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-bg px-3 py-2 text-[10.5px] text-text-faint">
                <span className="mono">↑↓ 选择</span>
                <span className="mono">Enter 打开</span>
                <span className="mono">Ctrl+Enter 新标签页</span>
                <span className="mono">Esc 关闭</span>
                <span className="ml-auto flex items-center gap-2">
                  <span style={{ color: 'var(--accent)' }}>书签 {bookmarkCount}</span>
                  {includeHistory && <span style={{ color: 'var(--info)' }}>历史 {historyCount}</span>}
                  <span>网页 1</span>
                </span>
              </div>
            </>
          ) : searching ? (
            <div className="px-3 py-4 text-[12.5px] text-text-faint">正在检索本地书签…</div>
          ) : (
            <div className="px-3 py-4">
              <p className="text-[12.5px] text-text-dim">没有匹配的书签，按 Enter 用默认搜索引擎查找。</p>
              {recent.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-text-faint">最近搜索</span>
                  {recent.slice(0, 5).map((item) => (
                    <button key={item} type="button" className="chip hover:text-accent" onClick={() => controller.change(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}