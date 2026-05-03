/** Client-only cache for cleaner job detail (sessionStorage) — improves on-site poor signal. */

const KEY_PREFIX = "cleanerJobDetailV1:";
/** Allow reading cached job for up to 2h; callers show staleness warnings. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type CleanerJobDetailCachedBody = Record<string, unknown>;

export type CleanerJobDetailCacheRead = {
  body: CleanerJobDetailCachedBody;
  /** Age of this cache entry since it was written. */
  ageMs: number;
};

export function readCleanerJobDetailCache(bookingId: string): CleanerJobDetailCacheRead | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = bookingId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; body: CleanerJobDetailCachedBody };
    if (!parsed?.body || typeof parsed.savedAt !== "number") return null;
    const ageMs = Date.now() - parsed.savedAt;
    if (ageMs > MAX_AGE_MS) return null;
    return { body: parsed.body, ageMs };
  } catch {
    return null;
  }
}

export function writeCleanerJobDetailCache(bookingId: string, body: CleanerJobDetailCachedBody): void {
  if (typeof sessionStorage === "undefined") return;
  const id = bookingId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify({ savedAt: Date.now(), body }));
  } catch {
    /* quota / private mode */
  }
}

export function clearCleanerJobDetailCache(bookingId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const id = bookingId.trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}
