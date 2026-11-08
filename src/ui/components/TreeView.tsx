import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight, Folder, FolderOpen, Bookmark as BookmarkIcon } from 'lucide-react';
import type { BookmarkNode } from '@/core/types';
import { ROOT_ID, SPECIAL_FOLDER_IDS } from '@/core/constants';
import { folderHue } from '../folderHue';

export const DRAG_MIME = 'application/x-sbh-node';

function countDeep(node: BookmarkNode): number {
  let total = 0;
  for (const child of node.children ?? []) total += child.url ? 1 : countDeep(child);
  return total;
}

interface RowProps {
  node: BookmarkNode;
  depth: number;
  activeId: string;
  expanded: Set<string>;
  dropId: string | null;
  onToggle(id: string): void;
  onSelect(id: string): void;
  onDropInto(dragId: string, folderId: string): void;
  setDropId: Dispatch<SetStateAction<string | null>>;
}

function FolderRow({ node, depth, activeId, expanded, dropId, onToggle, onSelect, onDropInto, setDropId }: RowProps) {
  const children = node.children ?? [];
  const folders = children.filter((child) => !child.url);
  const isOpen = expanded.has(node.id);
  const hue = folderHue(node.id);
  const special = SPECIAL_FOLDER_IDS.includes(node.id);

  return (
    <div>
      <div
        className="tree-row"
        data-active={activeId === node.id}
        data-drop={dropId === node.id}
        style={{ paddingLeft: 6 + depth * 13 }}
        role="treeitem"
        aria-expanded={folders.length ? isOpen : undefined}
        aria-selected={activeId === node.id}
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(node.id);
          }
          if (event.key === 'ArrowRight' && folders.length && !isOpen) onToggle(node.id);
          if (event.key === 'ArrowLeft' && isOpen) onToggle(node.id);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropId(node.id);
        }}
        onDragLeave={() => setDropId((current) => (current === node.id ? null : current))}
        onDrop={(event) => {
          const dragId = event.dataTransfer.getData(DRAG_MIME);
          setDropId(null);
          if (!dragId || dragId === node.id) return;
          event.preventDefault();
          event.stopPropagation();
          onDropInto(dragId, node.id);
        }}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-text-faint disabled:opacity-0"
          disabled={!folders.length}
          aria-label={isOpen ? `收起 ${node.title}` : `展开 ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
        >
          <ChevronRight size={12} className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        {isOpen ? (
          <FolderOpen size={14} style={{ color: hue }} className="shrink-0" aria-hidden="true" />
        ) : (
          <Folder size={14} style={{ color: hue }} className="shrink-0" aria-hidden="true" />
        )}
        <span className="clamp-1 min-w-0 flex-1 text-[12.5px] text-text-dim">{node.title || '未命名文件夹'}</span>
        {special && <BookmarkIcon size={10} className="shrink-0 text-text-faint" aria-label="浏览器原生文件夹" />}
        <span className="mono shrink-0 text-[10.5px] text-text-faint">{countDeep(node)}</span>
      </div>
      {isOpen && folders.length > 0 && (
        <div role="group">
          {folders.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              expanded={expanded}
              dropId={dropId}
              onToggle={onToggle}
              onSelect={onSelect}
              onDropInto={onDropInto}
              setDropId={setDropId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({
  tree,
  activeId,
  onSelect,
  onDropInto,
}: {
  tree: BookmarkNode[];
  activeId: string;
  onSelect(id: string): void;
  onDropInto(dragId: string, folderId: string): void;
}) {
  const roots = useMemo(() => tree.find((node) => node.id === ROOT_ID)?.children ?? tree, [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots.map((node) => node.id)));
  const [dropId, setDropId] = useState<string | null>(null);
  // tree 异步加载（挂载时为空）：新出现的根文件夹默认展开，已折叠的保持用户选择
  const seenRoots = useRef<Set<string>>(new Set(roots.map((node) => node.id)));

  useEffect(() => {
    const fresh = roots.filter((node) => !seenRoots.current.has(node.id));
    if (!fresh.length) return;
    for (const node of fresh) seenRoots.current.add(node.id);
    setExpanded((current) => {
      const next = new Set(current);
      for (const node of fresh) next.add(node.id);
      return next;
    });
  }, [roots]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div role="tree" aria-label="书签文件夹" className="space-y-0.5">
      {roots.map((node) =>
        node.url ? null : (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            activeId={activeId}
            expanded={expanded}
            dropId={dropId}
            onToggle={toggle}
            onSelect={onSelect}
            onDropInto={onDropInto}
            setDropId={setDropId}
          />
        ),
      )}
    </div>
  );
}