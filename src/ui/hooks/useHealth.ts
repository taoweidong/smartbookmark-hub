import { useCallback, useEffect, useState } from 'react';
import { CACHE_PREFIX, cache } from '@/core/cache';
import type { LinkHealth } from '@/core/types';

export function useHealth(): { health: Map<string, LinkHealth>; reload(): void } {
  const [health, setHealth] = useState<Map<string, LinkHealth>>(new Map());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void cache.entries<LinkHealth>(CACHE_PREFIX.health).then((entries) => {
      if (!alive) return;
      setHealth(new Map(entries.map(([key, value]) => [key.slice(CACHE_PREFIX.health.length), value])));
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { health, reload };
}