import { pinyin } from 'pinyin-pro';

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
const cache = new Map<string, { initials: string; full: string }>();

export function hasCJK(text: string): boolean {
  return CJK_RE.test(text);
}

function convert(text: string): { initials: string; full: string } {
  const cached = cache.get(text);
  if (cached) return cached;

  let result: { initials: string; full: string };
  if (hasCJK(text)) {
    const initials = pinyin(text, {
      pattern: 'first',
      toneType: 'none',
      type: 'array',
      nonZh: 'consecutive',
    })
      .join('')
      .toLowerCase()
      .replace(/\s+/g, '');
    const full = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
      .join('')
      .toLowerCase()
      .replace(/\s+/g, '');
    result = { initials, full };
  } else {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/).filter(Boolean);
    result = {
      initials: words.length > 1 ? words.map((w) => w[0]).join('') : lower,
      full: lower.replace(/\s+/g, ''),
    };
  }

  if (cache.size > 20000) cache.clear();
  cache.set(text, result);
  return result;
}

export function toInitials(text: string): string {
  return convert(text).initials;
}

export function toFullPinyin(text: string): string {
  return convert(text).full;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function clearPinyinCache(): void {
  cache.clear();
}