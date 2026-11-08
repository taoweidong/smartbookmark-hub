import { useCallback, useEffect, useState } from 'react';
import { Trash2, Undo2, Archive, ChevronDown, Folder, FileText } from 'lucide-react';
import { store } from '@/core/store';
import { formatDateTime, timeAgo } from '@/core/format';
import type { TrashBatch, TrashNode } from '@/core/types';
import { listTrash, purgeAll, purgeBatch, restoreBatch } from '@/core/trash';
import { EmptyState } from '@/ui/components/Feedback';
import type { ConfirmRequest } from '@/ui/components/Modal';

function countNodes(nodes: TrashNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
}

export function TrashPanel({ requestConfirm }: { requestConfirm(request: ConfirmRequest): void }) {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setBatches(await listTrash());
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '回收站读取失败',
        tone: 'danger',
      });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = async (batch: TrashBatch) => {
    if (busy) return;
    setBusy(true);
    try {
      const { restored, fallback } = await restoreBatch(batch.id);
      await store.getState().refresh();
      await reload();
      store.getState().pushToast({
        message: fallback
          ? `已恢复 ${restored} 项，原文件夹不存在，重建了 ${fallback} 个文件夹`
          : `已恢复 ${restored} 项到原位置`,
        tone: 'success',
      });
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '恢复失败',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const total = batches.reduce((sum, batch) => sum + countNodes(batch.nodes), 0);

  return (
    <section className="panel flex min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Archive size={13} className="text-accent" aria-hidden="true" />
        <h2 className="display text-[14px] text-text">回收站</h2>
        <span className="mono text-[11px] text-text-faint">{batches.length} 批 · {total} 项</span>
        <button
          type="button"
          className="btn btn-sm btn-danger ml-auto"
          disabled={!batches.length || busy}
          onClick={() =>
            requestConfirm({
              title: '清空回收站',
              description: `${total} 项将被永久移除，无法再恢复。浏览器收藏夹本身不受影响。`,
              confirmLabel: '永久清空',
              danger: true,
              async onConfirm() {
                try {
                  await purgeAll();
                  await reload();
                  store.getState().pushToast({ message: '回收站已清空', tone: 'info' });
                } catch (error) {
                  store.getState().pushToast({
                    message: error instanceof Error ? error.message : '清空失败',
                    tone: 'danger',
                  });
                }
              },
            })
          }
        >
          <Trash2 size={12} aria-hidden="true" />
          清空
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {batches.length === 0 ? (
          <EmptyState icon={<Archive size={20} aria-hidden="true" />} title="回收站是空的" description="在管理台或智能清理里删除的书签会先放到这里，最多保留最近 20 批。" />
        ) : (
          <div className="space-y-1.5">
            {batches.map((batch) => {
              const count = countNodes(batch.nodes);
              const open = openId === batch.id;
              return (
                <article key={batch.id} className="rounded-[6px] border border-line bg-bg">
                  <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : batch.id)}
                    >
                      <ChevronDown size={12} className={`shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="clamp-1 block text-[12.5px] text-text-dim">{batch.label}</span>
                        <span className="mono block text-[10.5px] text-text-faint">
                          {formatDateTime(batch.deletedAt)} · {timeAgo(batch.deletedAt)} · {count} 项
                        </span>
                      </span>
                    </button>
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void restore(batch)}>
                      <Undo2 size={12} aria-hidden="true" />
                      恢复
                    </button>
                    <button
                      type="button"
                      className="icon-btn h-6 w-6 hover:!text-danger"
                      aria-label="永久删除这一批"
                      disabled={busy}
                      onClick={() =>
                        requestConfirm({
                          title: '永久删除这一批',
                          description: `${count} 项将无法恢复。`,
                          confirmLabel: '永久删除',
                          danger: true,
                          async onConfirm() {
                            try {
                              await purgeBatch(batch.id);
                              await reload();
                            } catch (error) {
                              store.getState().pushToast({
                                message: error instanceof Error ? error.message : '删除失败',
                                tone: 'danger',
                              });
                            }
                          },
                        })
                      }
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                  {open && (
                    <ul className="max-h-[220px] space-y-0.5 overflow-y-auto border-t border-line px-2.5 py-2">
                      {batch.nodes.map((node) => (
                        <li key={node.id} className="flex items-center gap-2">
                          {node.url ? (
                            <FileText size={11} className="shrink-0 text-text-faint" aria-hidden="true" />
                          ) : (
                            <Folder size={11} className="shrink-0 text-info" aria-hidden="true" />
                          )}
                          <span className="clamp-1 min-w-0 flex-1 text-[11.5px] text-text-dim">{node.title || '未命名'}</span>
                          <span className="mono clamp-1 hidden max-w-[40%] shrink-0 text-[10px] text-text-faint sm:block">
                            {node.parentTitles.join(' / ') || '书签栏'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}