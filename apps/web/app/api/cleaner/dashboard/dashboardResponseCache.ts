type Cached = { at: number; body: unknown };

const store = new Map<string, Cached>();
const TTL_MS = 35_000;
const MAX_KEYS = 400;

const skipCache =
  process.env.SKIP_CLEANER_DASHBOARD_CACHE === "1" || process.env.NODE_ENV === "test";

export function getCleanerDashboardCache(cleanerId: string): unknown | null {
  if (skipCache) return null;
  const hit = store.get(cleanerId);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.body;
}

export function setCleanerDashboardCache(cleanerId: string, body: unknown): void {
  if (skipCache) return;
  store.set(cleanerId, { at: Date.now(), body });
  if (store.size <= MAX_KEYS) return;
  let oldest = Infinity;
  let oldestKey = "";
  for (const [k, v] of store) {
    if (v.at < oldest) {
      oldest = v.at;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}
