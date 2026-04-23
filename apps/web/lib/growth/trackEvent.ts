"use client";

export type GrowthEventType =
  | "page_view"
  | "start_booking"
  | "view_price"
  | "select_time"
  | "complete_booking"
  | "cleaners_loaded"
  | "times_loaded"
  | "price_calculated"
  | "booking_started"
  | "booking_completed"
  /** Upsell funnel: extras / bundles (payload.action, bundleId, extraId, step) */
  | "booking_upsell_interaction";

const SESSION_KEY = "shalean_growth_session_id";
const RETARGETING_KEY = "shalean_retargeting_pending";

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = `sess_${crypto.randomUUID()}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export function markRetargetingCandidate(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) window.localStorage.setItem(RETARGETING_KEY, "1");
  else window.localStorage.removeItem(RETARGETING_KEY);
}

export function trackGrowthEvent(
  eventType: GrowthEventType,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    event_type: eventType,
    payload: {
      ...payload,
      session_id: getSessionId(),
      pathname: window.location.pathname,
      referrer: document.referrer || null,
      retargeting_pending: window.localStorage.getItem(RETARGETING_KEY) === "1",
    },
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/event", blob);
      return;
    }
  } catch {
    // ignore and fallback to fetch
  }

  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // fire-and-forget
  });
}
