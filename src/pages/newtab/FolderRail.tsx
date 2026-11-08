import { folderHue } from '@/ui/folderHue';
import type { FolderInfo } from '@/core/bookmarks';
import { Folder } from 'lucide-react';

export function FolderRail({
  folders,
  activeId,
  total,
  onJump,
}: {
  folders: FolderInfo[];
  activeId: string;
  total: number;
  onJump(id: string): void;
}) {
  return (
    <nav aria-label="页签内的文件夹" className="sticky top-2 hidden max-h-[calc(100vh-190px)] w-[186px] shrink-0 flex-col overflow-y-auto pr-1 lg:flex">
      <div className="mb-1.5 flex items-baseline justify-between px-2.5">
        <span className="label">文件夹</span>
        <span className="mono text-[10.5px] text-text-faint">{total}</span>
      </div>
      <div className="space-y-0.5">
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className="folder-rail-item"
            data-active={activeId === folder.id}
            style={{ ['--folder-hue' as string]: folderHue(folder.id) }}
            onClick={() => onJump(folder.id)}
            title={folder.path.join(' / ')}
          >
            <Folder size={12} style={{ color: folderHue(folder.id) }} className="shrink-0" aria-hidden="true" />
            <span className="clamp-1 min-w-0 flex-1 text-[12px] text-text-dim">{folder.title}</span>
            <span className="mono shrink-0 text-[10.5px] text-text-faint">{folder.totalCount}</span>
          </button>
        ))}
      </div>
      <div className="rule mx-2.5 my-3" aria-hidden="true" />
      <p className="px-2.5 text-[10.5px] leading-relaxed text-text-faint">
        这里只展示你勾选的浏览器文件夹，原生书签栏保持不变。
      </p>
    </nav>
  );
}