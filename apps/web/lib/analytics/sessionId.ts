/**
 * Universal browser analytics session — correlates `user_events.payload`, `booking_events`,
 * experiments, and payment beacons. Migrates from legacy growth / funnel keys once.
 */
export const ANALYTICS_SESSION_STORAGE_KEY = "shalean_analytics_session_id_v1";
const LEGACY_GROWTH_SESSION_KEY = "shalean_growth_session_id";
const LEGACY_BOOKING_FUNNEL_KEY = "shalean_booking_funnel_session_id";
const ANALYTICS_SESSION_COOKIE = "shalean_analytics_session_id";

/** Re-export for booking flow code that still references the old constant name. */
export const BOOKING_FUNNEL_SESSION_LS_KEY = ANALYTICS_SESSION_STORAGE_KEY;

function persistPrimary(localStorage: Storage, id: string): void {
  localStorage.setItem(ANALYTICS_SESSION_STORAGE_KEY, id);
}

function syncCookie(id: string): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 60 * 60 * 24 * 400;
    document.cookie = `${ANALYTICS_SESSION_COOKIE}=${encodeURIComponent(id)};path=/;max-age=${maxAge};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/**
 * Returns a stable per-browser analytics session id (localStorage + cookie sync).
 * Safe on server: returns `"server"`.
 */
export function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const ls = window.localStorage;
    const id = ls.getItem(ANALYTICS_SESSION_STORAGE_KEY)?.trim();
    if (id && id.length >= 8) {
      syncCookie(id);
      return id;
    }
    const legacyGrowth = ls.getItem(LEGACY_GROWTH_SESSION_KEY)?.trim();
    const legacyBooking = ls.getItem(LEGACY_BOOKING_FUNNEL_KEY)?.trim();
    if (legacyGrowth && legacyGrowth.length >= 8) {
      persistPrimary(ls, legacyGrowth);
      syncCookie(legacyGrowth);
      return legacyGrowth;
    }
    if (legacyBooking && legacyBooking.length >= 8) {
      persistPrimary(ls, legacyBooking);
      syncCookie(legacyBooking);
      return legacyBooking;
    }
    const created = `sess_${crypto.randomUUID()}`;
    persistPrimary(ls, created);
    syncCookie(created);
    return created;
  } catch {
    const ephemeral = `sess_ephemeral_${Date.now()}`;
    syncCookie(ephemeral);
    return ephemeral;
  }
}
