export type PopupLayout = 'popup' | 'tab';

/**
 * popup.html 有两种形态：扩展弹窗（窄）与直接以标签页打开（宽）。
 * 弹窗的初始视口宽度是 Chrome 的上限 800px，用媒体查询区分会把弹窗撑成 800px，
 * 因此只能用 chrome.tabs.getCurrent()：只有当前文档位于标签页时它才有值。
 */
export async function detectPopupLayout(): Promise<PopupLayout> {
  const api = (globalThis as { chrome?: typeof chrome }).chrome;
  try {
    const tab = await api?.tabs.getCurrent();
    return tab ? 'tab' : 'popup';
  } catch {
    return 'popup';
  }
}
