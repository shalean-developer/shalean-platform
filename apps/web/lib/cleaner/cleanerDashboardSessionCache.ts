/** Client-only SWR-style cache for cleaner dashboard payload (sessionStorage). */

const KEY_PREFIX = "cleanerDashV1:";
const MAX_AGE_MS = 50_000;

export type CleanerDashboardCachedBody = {
  jobs: unknown;
  summary?: {
    today_cents?: number;
    today_breakdown?: unknown;
    suggested_daily_goal_cents?: number;
    server_now_ms?: number;
  };
};

export function readCleanerDashboardCache(cleanerId: string): CleanerDashboardCachedBody | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = cleanerId.trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; body: CleanerDashboardCachedBody };
    if (!parsed?.body || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.body;
  } catch {
    return null;
  }
}

export function writeCleanerDashboardCache(cleanerId: string, body: CleanerDashboardCachedBody): void {
  if (typeof sessionStorage === "undefined") return;
  const id = cleanerId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${id}`, JSON.stringify({ savedAt: Date.now(), body }));
  } catch {
    /* quota / private mode */
  }
}
