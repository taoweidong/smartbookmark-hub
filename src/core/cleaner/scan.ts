import { bookmarkService, flattenTree } from '../bookmarks';
import { CACHE_PREFIX, cache } from '../cache';
import { PERSIST_EVERY } from '../constants';
import { uid } from '../format';
import type { DeadLinkItem, LinkHealth, ScanReport } from '../types';
import { canonicalUrl, isHttpUrl } from '../url';
import { checkLink } from './deadLinks';
import { findDuplicates } from './duplicates';
import { findEmptyFolders } from './emptyFolders';
import { runPool } from './pool';

export interface ScanOptions {
  reportId?: string;
  concurrency: number;
  timeoutMs: number;
  hostDelayMs: number;
  cacheDays: number;
  ignoreWww: boolean;
  titleThreshold: number;
  force: boolean;
  signal?: AbortSignal;
  onProgress: (report: ScanReport) => void;
  fetchImpl?: typeof fetch;
}

const MAX_REPORTS = 10;

async function persist(report: ScanReport): Promise<void> {
  await cache.set(CACHE_PREFIX.report + report.id, report);
  const all = await listReports();
  for (const old of all.slice(MAX_REPORTS)) {
    await cache.del(CACHE_PREFIX.report + old.id);
  }
}

export async function listReports(): Promise<ScanReport[]> {
  const entries = await cache.entries<ScanReport>(CACHE_PREFIX.report);
  return entries.map(([, report]) => report).sort((a, b) => b.startedAt - a.startedAt);
}

export async function loadReport(id: string): Promise<ScanReport | undefined> {
  return cache.get<ScanReport>(CACHE_PREFIX.report + id);
}

export async function clearReports(): Promise<void> {
  await cache.clear(CACHE_PREFIX.report);
}

export async function runScan(opts: ScanOptions): Promise<ScanReport> {
  const tree = await bookmarkService.getTree();
  const flat = flattenTree(tree);
  const targets = flat.filter((item) => isHttpUrl(item.url));

  const existing = opts.reportId ? await loadReport(opts.reportId) : undefined;
  const report: ScanReport = existing ?? {
    id: uid('scan'),
    startedAt: Date.now(),
    total: targets.length,
    checked: 0,
    deadLinks: [],
    blocked: [],
    errors: [],
    duplicates: [],
    emptyFolders: [],
    cursor: 0,
    cancelled: false,
  };

  report.total = targets.length;
  report.duplicates = findDuplicates(flat, {
    ignoreWww: opts.ignoreWww,
    titleThreshold: opts.titleThreshold,
  });
  report.emptyFolders = findEmptyFolders(tree);
  report.cancelled = false;
  report.finishedAt = undefined;

  const doneIds = new Set(
    [...report.deadLinks, ...report.blocked, ...report.errors].map((item) => item.bookmark.id),
  );
  report.checked = doneIds.size;
  report.cursor = report.checked;

  const hostClock = new Map<string, number>();
  const cacheWindow = opts.cacheDays * 86_400_000;
  const pending = targets.filter((item) => !doneIds.has(item.id));
  let sincePersist = 0;

  opts.onProgress({ ...report });

  await runPool(
    pending,
    opts.concurrency,
    async (bookmark) => {
      if (opts.signal?.aborted) return;
      const key = CACHE_PREFIX.health + canonicalUrl(bookmark.url, { ignoreWww: opts.ignoreWww });

      let health = opts.force ? undefined : await cache.get<LinkHealth>(key);
      if (health && Date.now() - health.checkedAt > cacheWindow) health = undefined;
      if (!health) {
        health = await checkLink(bookmark.url, {
          timeoutMs: opts.timeoutMs,
          hostDelayMs: opts.hostDelayMs,
          hostClock,
          fetchImpl: opts.fetchImpl,
          signal: opts.signal,
        });
        if (health.status !== 'skipped') await cache.set(key, health);
      }

      if (health.status === 'skipped') return;

      report.checked += 1;
      report.cursor = report.checked;

      const item: DeadLinkItem = { bookmark, health };
      if (health.status === 'dead') report.deadLinks.push(item);
      else if (health.status === 'blocked') report.blocked.push(item);
      else if (health.status === 'error' || health.status === 'timeout') report.errors.push(item);

      sincePersist += 1;
      if (sincePersist >= PERSIST_EVERY) {
        sincePersist = 0;
        await persist(report);
        opts.onProgress({ ...report });
      }
    },
    { signal: opts.signal },
  );

  report.cancelled = Boolean(opts.signal?.aborted);
  if (!report.cancelled) report.finishedAt = Date.now();
  await persist(report);
  opts.onProgress({ ...report });
  return report;
}