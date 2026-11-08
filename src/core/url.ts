import { TRACKING_PARAMS } from './constants';

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || TRACKING_PARAMS.includes(k);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface CanonicalOptions {
  ignoreWww?: boolean;
}

export function canonicalUrl(url: string, opts: CanonicalOptions = {}): string {
  const raw = url.trim();
  if (!isHttpUrl(raw)) return raw.toLowerCase();

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.toLowerCase();
  }

  let host = parsed.hostname.toLowerCase();
  if (opts.ignoreWww && host.startsWith('www.')) host = host.slice(4);

  const defaultPort =
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443');
  const port = parsed.port && !defaultPort ? `:${parsed.port}` : '';

  const path = safeDecode(parsed.pathname).replace(/\/+$/, '') || '/';

  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `${parsed.protocol}//${host}${port}${path}${query ? `?${query}` : ''}`;
}

export function displayUrl(url: string): string {
  const raw = url.trim();
  if (!isHttpUrl(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const short = path.length > 28 ? `${path.slice(0, 28)}…` : path;
    return `${host}${short === '/' ? '' : short}`;
  } catch {
    return raw;
  }
}

export function faviconUrl(url: string, size = 64): string {
  const runtime = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  if (runtime?.id) {
    return `chrome-extension://${runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
  }
  return '';
}

export function letterAvatar(seed: string): { letter: string; hue: number } {
  const cleaned = seed.replace(/^www\./, '');
  const letter = (cleaned[0] || '?').toUpperCase();
  let hash = 0;
  for (let i = 0; i < cleaned.length; i += 1) hash = (hash * 31 + cleaned.charCodeAt(i)) % 360;
  return { letter, hue: hash };
}