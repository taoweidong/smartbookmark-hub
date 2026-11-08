import { getBackend } from './backend';
import { CHUNK_SIZE } from './constants';
import { yieldToBrowser } from './format';
import { toFullPinyin, toInitials } from './pinyin';
import type { FlatBookmark, SearchEntry, SearchResult } from './types';
import { canonicalUrl, displayUrl, hostOf } from './url';

export async function buildEntries(
  flat: FlatBookmark[],
  tags: Record<string, string[]> = {},
): Promise<SearchEntry[]> {
  const out: SearchEntry[] = [];
  for (let i = 0; i < flat.length; i += 1) {
    const item = flat[i];
    const itemTags = tags[item.id] ?? [];
    out.push({
      ...item,
      host: hostOf(item.url),
      canonicalUrl: canonicalUrl(item.url),
      titleLower: item.title.toLowerCase(),
      urlLower: item.url.toLowerCase(),
      initials: toInitials(item.title),
      pinyinFull: toFullPinyin(item.title),
      tags: itemTags,
      folderLower: item.folderPath.join('/').toLowerCase(),
      tagLowers: itemTags.map((tag) => tag.toLowerCase()),
    });
    if ((i + 1) % CHUNK_SIZE === 0) await yieldToBrowser();
  }
  return out;
}

export function splitTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
}

interface TermHit {
  score: number;
  on: string;
}

function scoreTerm(entry: SearchEntry, term: string): TermHit | null {
  let best = 0;
  let on = '';
  const consider = (value: number, label: string) => {
    if (value > best) {
      best = value;
      on = label;
    }
  };

  if (entry.titleLower === term) consider(120, '标题');
  if (entry.titleLower.startsWith(term)) consider(80, '标题');
  if (entry.titleLower.includes(term)) consider(55, '标题');

  if (entry.initials === term) consider(90, '拼音首字母');
  else if (entry.initials.startsWith(term)) consider(60, '拼音首字母');
  else if (term.length >= 2 && entry.initials.includes(term)) consider(35, '拼音首字母');

  if (entry.pinyinFull.startsWith(term)) consider(55, '全拼');
  else if (term.length >= 3 && entry.pinyinFull.includes(term)) consider(30, '全拼');

  if (entry.host === term) consider(45, '域名');
  else if (entry.host.startsWith(term)) consider(30, '域名');

  if (entry.urlLower.includes(term)) consider(25, 'URL');
  if (entry.folderLower.includes(term)) consider(15, '文件夹');

  for (const lower of entry.tagLowers) {
    if (lower === term) consider(70, '标签');
    else if (lower.includes(term)) consider(40, '标签');
  }

  return best > 0 ? { score: best, on } : null;
}

export interface ScoredEntry {
  entry: SearchEntry;
  score: number;
  matchedOn: string;
}

export function scoreEntry(entry: SearchEntry, terms: string[], now = Date.now()): ScoredEntry | null {
  if (!terms.length) return null;

  let total = 0;
  const labels = new Set<string>();
  for (const term of terms) {
    const hit = scoreTerm(entry, term);
    if (!hit) return null;
    total += hit.score;
    labels.add(hit.on);
  }

  if (terms.every((term) => entry.titleLower.includes(term))) total += 40;
  if (now - entry.dateAdded < 7 * 86_400_000) total += 10;
  total -= Math.min(15, entry.title.length / 8);

  return { entry, score: total, matchedOn: [...labels].join(' · ') };
}

export function rankBookmarks(
  entries: SearchEntry[],
  query: string,
  limit: number,
  now = Date.now(),
): SearchResult[] {
  const terms = splitTerms(query);
  if (!terms.length) return [];

  const scored: ScoredEntry[] = [];
  for (const entry of entries) {
    const hit = scoreEntry(entry, terms, now);
    if (hit && hit.score > 0) scored.push(hit);
  }

  scored.sort((a, b) => b.score - a.score || b.entry.dateAdded - a.entry.dateAdded);

  const seen = new Set<string>();
  const unique: ScoredEntry[] = [];
  for (const hit of scored) {
    if (seen.has(hit.entry.canonicalUrl)) continue;
    seen.add(hit.entry.canonicalUrl);
    unique.push(hit);
    if (unique.length >= limit) break;
  }

  return unique.map(({ entry, score, matchedOn }) => ({
    kind: 'bookmark' as const,
    id: entry.id,
    title: entry.title,
    url: entry.url,
    subtitle: [...entry.folderPath, displayUrl(entry.url)].filter(Boolean).join(' / '),
    score,
    matchedOn,
  }));
}

export interface SearchAllOptions {
  includeHistory: boolean;
  historyDays: number;
  limit: number;
}

export async function searchAll(
  entries: SearchEntry[],
  query: string,
  opts: SearchAllOptions,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const bookmarks = rankBookmarks(entries, trimmed, opts.limit);
  const results: SearchResult[] = [...bookmarks];

  if (opts.includeHistory && results.length < opts.limit) {
    const seen = new Set(entries.map((entry) => entry.canonicalUrl));
    const items = await getBackend().historySearch(trimmed, opts.historyDays, opts.limit);
    const lower = trimmed.toLowerCase();
    const historyResults: SearchResult[] = [];

    for (const item of items) {
      const canonical = canonicalUrl(item.url);
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      const title = (item.title || item.url).toLowerCase();
      let score = 8;
      let matchedOn = '历史记录';
      if (title.startsWith(lower)) {
        score = 34;
        matchedOn = '历史 · 标题';
      } else if (title.includes(lower)) {
        score = 26;
        matchedOn = '历史 · 标题';
      } else if (item.url.toLowerCase().includes(lower)) {
        score = 18;
        matchedOn = '历史 · URL';
      }
      const ageDays = (Date.now() - item.lastVisitTime) / 86_400_000;
      score += Math.max(0, 6 - ageDays / 2);

      historyResults.push({
        kind: 'history',
        id: `history:${item.url}`,
        title: item.title || item.url,
        url: item.url,
        subtitle: `历史记录 · ${displayUrl(item.url)}`,
        score: Math.min(40, score),
        matchedOn,
      });
    }

    historyResults.sort((a, b) => b.score - a.score);
    results.push(...historyResults.slice(0, Math.max(0, opts.limit - results.length)));
  }

  results.push({
    kind: 'web',
    id: 'web-search',
    title: `在默认搜索引擎中搜索“${trimmed}”`,
    url: '',
    subtitle: '网页搜索 · 使用浏览器设置的默认引擎',
    score: -1,
    matchedOn: '网页',
  });

  return results.slice(0, opts.limit + 1);
}