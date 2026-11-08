import { hostOf } from '@/core/url';
import type { FlatBookmark } from '@/core/types';

export function demoFetchFor(bookmarks: FlatBookmark[]): typeof fetch {
  const statusByUrl = new Map<string, number>();
  for (const item of bookmarks) {
    if (/dead-link|old-tool|removed-page|legacy/i.test(item.url)) {
      statusByUrl.set(item.url, 404);
    } else if (/^(mail|internal|corp)\./.test(hostOf(item.url))) {
      // 按主机名前缀判定，避免 gmail.com 这类含 "mail" 子串的公共站点被误伤
      statusByUrl.set(item.url, 403);
    } else {
      statusByUrl.set(item.url, 200);
    }
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // 尊重取消信号，让演示模式下的「暂停检测」行为与真实 fetch 一致
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 12);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        },
        { once: true },
      );
    });
    const status = statusByUrl.get(url) ?? 200;
    return new Response(null, { status, statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Forbidden' });
  }) as typeof fetch;
}