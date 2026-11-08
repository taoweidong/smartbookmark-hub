import type { LinkHealth, LinkStatus } from '../types';
import { canonicalUrl, hostOf, isHttpUrl } from '../url';

export function classifyStatus(status: number): LinkStatus {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410 || status === 451) return 'dead';
  if (status === 403 || status === 429 || status === 503) return 'blocked';
  return 'error';
}

export interface CheckOptions {
  timeoutMs: number;
  hostDelayMs: number;
  hostClock: Map<string, number>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function checkLink(url: string, opts: CheckOptions): Promise<LinkHealth> {
  const canonical = canonicalUrl(url);
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const checkedAt = now();

  if (!isHttpUrl(url)) {
    return { canonicalUrl: canonical, status: 'skipped', checkedAt, message: '非 HTTP(S) 链接，已跳过' };
  }
  if (opts.signal?.aborted) {
    return { canonicalUrl: canonical, status: 'skipped', checkedAt, message: '扫描已取消' };
  }

  const host = hostOf(url);
  const last = opts.hostClock.get(host);
  const wait = last === undefined ? 0 : Math.max(0, last + opts.hostDelayMs - now());
  opts.hostClock.set(host, now() + wait);
  if (wait > 0) await sleep(wait);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);

  const request = async (method: 'HEAD' | 'GET'): Promise<Response> =>
    doFetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

  try {
    let response: Response;
    try {
      response = await request('HEAD');
      if (response.status === 405 || response.status === 501) response = await request('GET');
    } catch (error) {
      if (controller.signal.aborted) throw error;
      response = await request('GET');
    }

    const status = classifyStatus(response.status);
    return {
      canonicalUrl: canonical,
      status,
      httpStatus: response.status,
      finalUrl: response.url || url,
      checkedAt: now(),
      message:
        status === 'ok'
          ? undefined
          : status === 'dead'
            ? `HTTP ${response.status} · 页面已不存在`
            : status === 'blocked'
              ? `HTTP ${response.status} · 被拦截或限流，不判定为死链`
              : `HTTP ${response.status} · 服务器异常，建议复检`,
    };
  } catch (error) {
    if (opts.signal?.aborted) {
      return { canonicalUrl: canonical, status: 'skipped', checkedAt: now(), message: '扫描已取消' };
    }
    if (timedOut) {
      return {
        canonicalUrl: canonical,
        status: 'timeout',
        checkedAt: now(),
        message: `超过 ${opts.timeoutMs}ms 未响应`,
      };
    }
    return {
      canonicalUrl: canonical,
      status: 'error',
      checkedAt: now(),
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}