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
  | "booking_upsell_interaction"
  /** Marketing homepage — payload: service, extrasCount, total */
  | "homepage_continue_booking"
  /** Marketing homepage — payload: cta, placement */
  | "homepage_cta_click"
  /** Marketing homepage — payload: source, service, title? */
  | "homepage_service_select"
  /** Marketing homepage — catalog ready; payload: loadTimeMs */
  | "pricing_loaded"
  /** Marketing homepage — leave without starting booking handoff; payload: step, service, extrasCount */
  | "homepage_abandon"
  /** Marketing homepage — scroll depth milestone; payload: depth (0–100) */
  | "homepage_scroll"
  /** Booking flow — total changed after slot/time selection; payload: from, to, reason */
  | "price_updated"
  /** Review link opened (marketing SMS/email/deep link); payload: booking_id */
  | "review_prompt_clicked"
  /** Customer opened Paystack / redirect checkout; payload: step, service */
  | "payment_initiated"
  /** Payment succeeded (client beacon on success page); payload: reference?, booking_id? */
  | "payment_completed";

const SESSION_KEY = "shalean_growth_session_id";
const RETARGETING_KEY = "shalean_retargeting_pending";

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `sess_${crypto.randomUUID()}`;
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `sess_ephemeral_${Date.now()}`;
  }
}

export type AnalyticsDevice = "mobile" | "desktop";

export function getGrowthSessionId(): string {
  return getSessionId();
}

export function getAnalyticsDevice(): AnalyticsDevice {
  if (typeof window === "undefined") return "desktop";
  try {
    return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

/**
 * Extra fields for events fired from the marketing homepage.
 * Uses `traffic_source: "homepage"` so payloads can still use `source` for interaction-specific values
 * (e.g. quote_widget vs service_card).
 */
export function withHomepageContext(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: getSessionId(),
    device: getAnalyticsDevice(),
    traffic_source: "homepage",
    page_source: "homepage",
    ...payload,
  };
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
