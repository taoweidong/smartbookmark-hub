import { useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react';
import { store, useApp } from '@/core/store';
import { uid } from '@/core/format';
import type { DashboardTab } from '@/core/types';

export function TabStrip({
  onAdd,
  onRename,
  onDelete,
}: {
  onAdd(): void;
  onRename(tab: DashboardTab): void;
  onDelete(tab: DashboardTab): void;
}) {
  const dashboard = useApp((state) => state.settings.dashboard);
  const folders = useApp((state) => state.folders);
  const [dragId, setDragId] = useState<string | null>(null);

  const activate = (id: string) => void store.getState().updateSettings({ dashboard: { activeTabId: id } });

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const tabs = [...dashboard.tabs];
    const from = tabs.findIndex((tab) => tab.id === dragId);
    const to = tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved);
    void store.getState().updateSettings({ dashboard: { tabs } });
    setDragId(null);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="首页页签">
      {dashboard.tabs.map((tab) => {
        const active = tab.id === dashboard.activeTabId;
        const count = tab.folderIds.filter((id) => folders.some((folder) => folder.id === id)).length;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            draggable
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => reorder(tab.id)}
            onClick={() => activate(tab.id)}
            onDoubleClick={() => onRename(tab)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate(tab.id);
              }
            }}
            className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors duration-150"
            style={{
              borderColor: active ? 'var(--accent)' : 'var(--line)',
              background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-faint)',
              opacity: dragId === tab.id ? 0.4 : 1,
            }}
            title={`${tab.name} · ${count} 个文件夹（双击重命名，可拖拽排序）`}
          >
            <LayoutGrid size={11} aria-hidden="true" style={{ color: active ? 'var(--accent)' : undefined }} />
            {tab.name}
            <span className="mono text-[10px] opacity-70">{count}</span>
            {active && (
              <span className="ml-0.5 flex items-center gap-0.5">
                <button
                  type="button"
                  className="icon-btn h-5 w-5"
                  aria-label={`重命名页签 ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRename(tab);
                  }}
                >
                  <Pencil size={10} aria-hidden="true" />
                </button>
                {dashboard.tabs.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn h-5 w-5 hover:!text-danger"
                    aria-label={`删除页签 ${tab.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(tab);
                    }}
                  >
                    <Trash2 size={10} aria-hidden="true" />
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="icon-btn h-[27px] w-[27px] shrink-0"
        aria-label="新建页签"
        title="新建页签"
        disabled={dashboard.tabs.length >= 8}
        onClick={onAdd}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function makeTab(name: string): DashboardTab {
  return { id: uid('tab'), name, folderIds: [] };
}