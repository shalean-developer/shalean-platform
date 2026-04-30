import "server-only";

type Entry = { expiresAtMs: number; payload: unknown };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 45_000;

export function cleanerAvailabilityCacheKey(dateYmd: string, timeHm: string): string {
  return `${dateYmd}|${timeHm}`;
}

export function getCleanerAvailabilityCached<T>(key: string): T | null {
  const e = store.get(key);
  if (!e || Date.now() > e.expiresAtMs) {
    if (e) store.delete(key);
    return null;
  }
  return e.payload as T;
}

export function setCleanerAvailabilityCached(key: string, payload: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { expiresAtMs: Date.now() + ttlMs, payload });
}

/** Call after booking create/update that can change slot occupancy for this date+time (Johannesburg slot). */
export function invalidateCleanerAvailabilityCache(dateYmd: string | null | undefined, timeHmRaw: string | null | undefined): void {
  const d = typeof dateYmd === "string" ? dateYmd.trim() : "";
  const t = typeof timeHmRaw === "string" ? timeHmRaw.trim().slice(0, 5) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return;
  store.delete(cleanerAvailabilityCacheKey(d, t));
}
