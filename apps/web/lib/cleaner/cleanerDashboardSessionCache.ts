/** Client-only SWR-style cache for cleaner dashboard payload (sessionStorage). */

const KEY_PREFIX = "cleanerDashV1:";
const MAX_AGE_MS = 10_000;

/** Drop all cleaner dashboard session payloads (e.g. after job lifecycle POST so Home is not seeded stale). */
export function clearAllCleanerDashboardSessionCaches(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(KEY_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Same-tab hint: dashboard hook may refetch if mounted (optional; cache clear is the main fix). */
export const CLEANER_DASHBOARD_JOBS_REFRESH_EVENT = "shalean:cleaner-dashboard-jobs-refresh";

export function signalCleanerDashboardJobsRefresh(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}

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
