import { normalizeTitle } from '../pinyin';
import type { DuplicateGroup, FlatBookmark } from '../types';
import { canonicalUrl, hostOf } from '../url';

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  if (!value) return out;
  if (value.length < 2) {
    out.add(value);
    return out;
  }
  for (let i = 0; i < value.length - 1; i += 1) out.add(value.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(dice(bigrams(na), bigrams(nb)), dice(words(a), words(b)));
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

export interface DuplicateOptions {
  ignoreWww: boolean;
  titleThreshold: number;
}

function bucketUnion(
  buckets: Map<string, number[]>,
  uf: UnionFind,
  compare?: (a: number, b: number) => boolean,
): void {
  for (const indexes of buckets.values()) {
    if (indexes.length < 2) continue;
    if (!compare) {
      for (let i = 1; i < indexes.length; i += 1) uf.union(indexes[0], indexes[i]);
      continue;
    }
    for (let i = 0; i < indexes.length; i += 1) {
      for (let j = i + 1; j < indexes.length; j += 1) {
        if (compare(indexes[i], indexes[j])) uf.union(indexes[i], indexes[j]);
      }
    }
  }
}

export function findDuplicates(
  flat: FlatBookmark[],
  opts: DuplicateOptions,
): DuplicateGroup[] {
  const size = flat.length;
  if (size < 2) return [];

  const uf = new UnionFind(size);
  const canonicals = flat.map((item) => canonicalUrl(item.url, { ignoreWww: opts.ignoreWww }));
  const titles = flat.map((item) => normalizeTitle(item.title));
  const hosts = flat.map((item) => hostOf(item.url));

  const byUrl = new Map<string, number[]>();
  const byTitle = new Map<string, number[]>();
  const byBlock = new Map<string, number[]>();

  const push = (map: Map<string, number[]>, key: string, index: number) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  };

  for (let i = 0; i < size; i += 1) {
    push(byUrl, canonicals[i], i);
    push(byTitle, titles[i], i);
    push(byBlock, `${hosts[i]}|${titles[i].slice(0, 3)}`, i);
  }

  bucketUnion(byUrl, uf);
  bucketUnion(byTitle, uf);
  bucketUnion(byBlock, uf, (a, b) => titleSimilarity(flat[a].title, flat[b].title) >= opts.titleThreshold);

  const components = new Map<number, number[]>();
  for (let i = 0; i < size; i += 1) {
    const root = uf.find(i);
    const list = components.get(root);
    if (list) list.push(i);
    else components.set(root, [i]);
  }

  const groups: DuplicateGroup[] = [];
  for (const indexes of components.values()) {
    if (indexes.length < 2) continue;

    const members = indexes
      .map((index) => ({ index, item: flat[index] }))
      .sort(
        (a, b) =>
          a.item.dateAdded - b.item.dateAdded ||
          canonicals[a.index].length - canonicals[b.index].length ||
          a.item.id.localeCompare(b.item.id),
      );

    const keep = members[0];
    const uniqueUrls = new Set(members.map((member) => canonicals[member.index]));
    const uniqueTitles = new Set(members.map((member) => titles[member.index]));

    const reason: DuplicateGroup['reason'] = uniqueUrls.size === 1 ? 'url' : 'title';
    const similarity =
      uniqueUrls.size === 1 || uniqueTitles.size === 1
        ? 1
        : Math.round(
            Math.min(
              ...members
                .slice(1)
                .map((member) => titleSimilarity(flat[keep.index].title, flat[member.index].title)),
            ) * 100,
          ) / 100;

    groups.push({
      key: reason === 'url' ? canonicals[keep.index] : titles[keep.index],
      reason,
      items: members.map((member) => member.item),
      keepId: keep.item.id,
      similarity,
    });
  }

  return groups.sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}