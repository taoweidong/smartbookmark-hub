import { escapeXml, truncate } from '@/core/format';
import type { SearchResult } from '@/core/types';
import { displayUrl } from '@/core/url';

export const WEB_PREFIX = 'sbh-web::';

export function toSuggestions(results: SearchResult[]): chrome.omnibox.SuggestResult[] {
  return results.map((result) => {
    const title = escapeXml(truncate(result.title, 70));
    if (result.kind === 'web') {
      const query = result.title.replace(/^在默认搜索引擎中搜索“/, '').replace(/”$/, '');
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

export function parseSuggestionContent(content: string): { kind: 'web'; text: string } | { kind: 'url'; url: string } {
  if (content.startsWith(WEB_PREFIX)) {
    return { kind: 'web', text: content.slice(WEB_PREFIX.length) };
  }
  return { kind: 'url', url: content };
}