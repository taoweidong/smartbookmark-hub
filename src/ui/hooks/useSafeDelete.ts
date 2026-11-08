import { useCallback } from 'react';
import { store } from '@/core/store';
import { deleteWithUndo, restoreBatch } from '@/core/trash';
import type { ConfirmRequest } from '../components/Modal';

export function useSafeDelete(requestConfirm: (request: ConfirmRequest) => void) {
  return useCallback(
    (ids: string[], preview: ConfirmRequest['items'], label: string) => {
      if (!ids.length) return;
      requestConfirm({
        title: `删除 ${ids.length} 项`,
        description: '以下内容将从浏览器收藏夹中移除，删除后可在回收站恢复。',
        items: preview,
        confirmLabel: '确认删除',
        danger: true,
        async onConfirm() {
          try {
            const batch = await deleteWithUndo(ids, label);
            await store.getState().refresh();
            store.getState().clearSelection();
            store.getState().pushToast({
              message: `已删除 ${batch.nodes.length} 项，可在回收站恢复`,
              tone: 'warning',
              undo: () => {
                void (async () => {
                  try {
                    const { restored } = await restoreBatch(batch.id);
                    await store.getState().refresh();
                    store.getState().pushToast({ message: `已恢复 ${restored} 项`, tone: 'success' });
                  } catch (error) {
                    store.getState().pushToast({
                      message: error instanceof Error ? error.message : '恢复失败',
                      tone: 'danger',
                    });
                  }
                })();
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
    },
    [requestConfirm],
  );
}