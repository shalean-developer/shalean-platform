"use client";

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const requestCache = new Map<string, CacheEntry<unknown>>();

/**
 * Coalesces identical browser requests and briefly reuses their result across
 * React remounts and adjacent booking steps. Rejections are never cached.
 */
export function cachedClientRequest<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  const existing = requestCache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    if (existing.value !== undefined) return Promise.resolve(existing.value);
    if (existing.promise) return existing.promise;
  }

  const promise = load()
    .then((value) => {
      requestCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      requestCache.delete(key);
      throw error;
    });
  requestCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

export function clearClientRequestCacheForTests(): void {
  requestCache.clear();
}
