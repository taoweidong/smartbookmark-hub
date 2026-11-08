import type { FlatBookmark } from '@/core/types';

export function demoFetchFor(bookmarks: FlatBookmark[]): typeof fetch {
  const statusByUrl = new Map<string, number>();
  for (const item of bookmarks) {
    if (/dead-link|old-tool|removed-page|legacy/i.test(item.url)) statusByUrl.set(item.url, 404);
    else if (/mail\.|internal|corp\./i.test(item.url)) statusByUrl.set(item.url, 403);
    else statusByUrl.set(item.url, 200);
  }

  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const status = statusByUrl.get(url) ?? 200;
    await new Promise((resolve) => setTimeout(resolve, 12));
    return new Response(null, { status, statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Forbidden' });
  }) as typeof fetch;
}