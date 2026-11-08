import { useMemo, useState } from 'react';
import { Check, Folder, Search, Wand2 } from 'lucide-react';
import type { FolderInfo } from '@/core/bookmarks';
import { folderHue } from '../folderHue';

export function FolderPicker({
  folders,
  selected,
  onChange,
}: {
  folders: FolderInfo[];
  selected: string[];
  onChange(ids: string[]): void;
}) {
  const [filter, setFilter] = useState('');
  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    if (!lower) return folders;
    return folders.filter((folder) => folder.path.join('/').toLowerCase().includes(lower));
  }, [folders, filter]);

  const toggle = (id: string) => {
    onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <input
            className="input pl-8"
            placeholder="筛选文件夹"
            value={filter}
            aria-label="筛选文件夹"
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange(folders.filter((folder) => !folder.special && folder.depth <= 1 && folder.totalCount > 0).map((folder) => folder.id))}
        >
          <Wand2 size={12} aria-hidden="true" />
          推荐
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onChange([])}>
          全不选
        </button>
      </div>

      <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {visible.map((folder) => {
          const active = chosen.has(folder.id);
          const hue = folderHue(folder.id);
          return (
            <button
              key={folder.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(folder.id)}
              className="tree-row w-full"
              data-active={active}
              style={{ paddingLeft: 8 + Math.min(folder.depth, 4) * 14 }}
            >
              <span
                className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border"
                style={{
                  borderColor: active ? hue : 'var(--line-strong)',
                  background: active ? hue : 'transparent',
                  color: active ? '#0b0f1e' : 'transparent',
                }}
                aria-hidden="true"
              >
                <Check size={11} strokeWidth={3} />
              </span>
              <Folder size={13} style={{ color: hue }} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-left">
                <span className="clamp-1 block text-[12.5px] text-text-dim">{folder.title}</span>
                {folder.path.length > 1 && (
                  <span className="clamp-1 block text-[10.5px] text-text-faint">{folder.path.slice(0, -1).join(' / ')}</span>
                )}
              </span>
              <span className="mono shrink-0 text-[11px] text-text-faint">{folder.totalCount}</span>
              {folder.special && <span className="chip shrink-0">原生</span>}
            </button>
          );
        })}
        {!visible.length && <p className="px-2 py-6 text-center text-[12.5px] text-text-faint">没有匹配的文件夹。</p>}
      </div>
    </div>
  );
}