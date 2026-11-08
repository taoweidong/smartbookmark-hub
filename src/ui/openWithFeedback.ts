import { getBackend } from '@/core/backend';
import { store } from '@/core/store';

// UI 层统一的打开书签入口：失败不再静默，给出可感知的提示（v2 R6h）
export async function openWithFeedback(
  url: string,
  disposition: 'current' | 'newTab' = 'newTab',
): Promise<void> {
  try {
    await getBackend().openUrl(url, disposition);
  } catch (error) {
    store.getState().pushToast({
      message: error instanceof Error ? error.message : '打开链接失败',
      tone: 'danger',
    });
  }
}
