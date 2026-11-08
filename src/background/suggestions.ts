import { escapeXml, truncate } from '@/core/format';
import type { SearchResult } from '@/core/types';
import { webSearchTitle } from '@/core/search';
import { displayUrl } from '@/core/url';

export const WEB_PREFIX = 'sbh-web::';

export function toSuggestions(results: SearchResult[]): chrome.omnibox.SuggestResult[] {
  return results.map((result) => {
    const title = escapeXml(truncate(result.title, 70));
    if (result.kind === 'web') {
      // 优先用结构化 query 字段；对没有该字段的旧结果回退到文案反解
      const query = result.query ?? stripWebTitle(result.title);
      return {
        content: `${WEB_PREFIX}${query}`,
        description: `<match>${title}</match> <dim>· 网页搜索</dim>`,
      };
    }
    const badge = result.kind === 'history' ? '<dim>[历史]</dim> ' : '';
    const url = escapeXml(truncate(displayUrl(result.url), 60));
    return {
      content: result.url,
      description: `${badge}<match>${title}</match> <url>${url}</url>`,
    };
  });
}

export function stripWebTitle(title: string): string {
  const prefix = webSearchTitle('').slice(0, -1); // 去掉末尾的收尾引号，得到前缀
  const suffix = '”';
  if (title.startsWith(prefix) && title.endsWith(suffix)) {
    return title.slice(prefix.length, -suffix.length);
  }
  return title;
}

export function parseSuggestionContent(
  content: string,
): { kind: 'web'; text: string } | { kind: 'url'; url: string } | { kind: 'text'; text: string } {
  if (content.startsWith(WEB_PREFIX)) {
    return { kind: 'web', text: content.slice(WEB_PREFIX.length) };
  }
  if (/^https?:\/\//i.test(content.trim())) {
    return { kind: 'url', url: content };
  }
  // 用户直接回车的自由文本：交给默认搜索引擎，而不是当 URL 打开
  return { kind: 'text', text: content };
}