import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { getBackend } from '@/core/backend';
import { rememberQuery } from '@/core/settings';
import { store, useApp } from '@/core/store';
import type { Disposition, SearchResult } from '@/core/types';

export interface SearchController {
  query: string;
  results: SearchResult[];
  searching: boolean;
  activeIndex: number;
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  change(value: string): void;
  clear(): void;
  focus(): void;
  setOpen(value: boolean): void;
  setActiveIndex(index: number): void;
  activate(result: SearchResult, disposition?: Disposition): Promise<void>;
  onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void;
}

export function useSearch(initialQuery = ''): SearchController {
  const query = useApp((state) => state.query);
  const results = useApp((state) => state.results);
  const searching = useApp((state) => state.searching);
  const debounceMs = useApp((state) => state.settings.search.debounceMs);

  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !initialQuery) return;
    seeded.current = true;
    store.getState().setQuery(initialQuery);
    void store.getState().runSearch(initialQuery);
    setOpen(true);
  }, [initialQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = useCallback(
    (value: string) => {
      store.getState().setQuery(value);
      setOpen(Boolean(value.trim()));
      if (timer.current) clearTimeout(timer.current);
      if (!value.trim()) return;
      timer.current = setTimeout(() => {
        void store.getState().runSearch(value);
      }, debounceMs);
    },
    [debounceMs],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    store.getState().setQuery('');
    setOpen(false);
  }, []);

  const focus = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    if (store.getState().query.trim()) setOpen(true);
  }, []);

  const activate = useCallback(
    async (result: SearchResult, disposition: Disposition = 'current') => {
      const backend = getBackend();
      const text = store.getState().query.trim();
      setOpen(false);
      inputRef.current?.blur();
      try {
        if (result.kind === 'web') await backend.webSearch(text, disposition === 'current' ? 'current' : 'newTab');
        else await backend.openUrl(result.url, disposition);
        if (text) {
          const settings = await rememberQuery(text);
          store.setState({ settings });
        }
      } catch (error) {
        store.getState().pushToast({
          message: error instanceof Error ? error.message : '打开链接失败',
          tone: 'danger',
        });
      }
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      const list = store.getState().results;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!list.length) return;
        setOpen(true);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + delta + list.length) % list.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = list[activeIndex] ?? list[0];
        if (target) void activate(target, event.ctrlKey || event.metaKey ? 'newTab' : 'current');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (open) setOpen(false);
        else if (store.getState().query) clear();
        else inputRef.current?.blur();
        return;
      }
      if (event.key === 'Tab') setOpen(false);
    },
    [activeIndex, activate, clear, open],
  );

  return {
    query,
    results,
    searching,
    activeIndex,
    open: open && Boolean(query.trim()),
    inputRef,
    change,
    clear,
    focus,
    setOpen,
    setActiveIndex,
    activate,
    onKeyDown,
  };
}