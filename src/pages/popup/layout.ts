import { getBackend } from '@/core/backend';

export type PopupLayout = 'popup' | 'tab';

/**
 * popup.html 有两种形态：扩展弹窗（窄）与直接以标签页打开（宽）。
 * 弹窗的初始视口宽度是浏览器上限 800px，用媒体查询区分会把弹窗误判为宽屏，
 * 因此只能询问平台适配层：只有当前文档确实位于标签页时才用宽形态。
 */
export async function detectPopupLayout(): Promise<PopupLayout> {
  try {
    return (await getBackend().isTabContext()) ? 'tab' : 'popup';
  } catch {
    return 'popup';
  }
}
