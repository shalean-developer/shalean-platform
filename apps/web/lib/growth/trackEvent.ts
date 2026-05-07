"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

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
  | "payment_completed"
  /** Blog — payload: slug, depth (25|50|75|100) */
  | "blog_scroll"
  /** Blog booking/marketing CTA; payload: slug, placement, href?, optional TOC bridge: last_engaged_heading_*, engagement_*, heading_* */
  | "blog_cta_click"
  /** Blog dwell time signal; payload: slug, seconds */
  | "blog_time_on_page"
  /** Blog TOC jump; payload: slug, heading, heading_depth, toc_target_id */
  | "blog_toc_click"
  /** After a TOC click: scroll completion + dwell proxy; payload: slug, heading_id, heading_label, heading_depth, max_scroll_after_click_pct, time_after_click_ms, … */
  | "blog_toc_section_engagement"
  /** Location hub scroll milestone; payload: depth (25|50|75|100), page_slug, suburb, … */
  | "seo_location_scroll"
  /** Hub booking / pricing CTA; payload: cta_location, cta_label, cta_kind, page_slug, suburb, … */
  | "seo_cta_click"
  /** Services hub card or location hub service tile; payload: click_type (learn_more|book|tile), service_name, … */
  | "seo_service_card_click"
  /** FAQ accordion / details opened; payload: question, surface, page_slug, … */
  | "seo_faq_expand"
  /** Pricing band interaction (e.g. Get exact price); payload: interaction, surface, … */
  | "seo_pricing_interaction";

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

function forwardToGa4(eventType: GrowthEventType, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!measurementId || typeof window.gtag !== "function") return;
  const name =
    eventType === "seo_location_scroll"
      ? "seo_scroll_depth"
      : eventType === "seo_cta_click"
        ? "seo_cta_click"
        : eventType === "seo_service_card_click"
          ? "seo_service_click"
          : eventType === "seo_faq_expand"
            ? "seo_faq_expand"
            : eventType === "seo_pricing_interaction"
              ? "seo_pricing_click"
              : eventType;
  try {
    window.gtag("event", name, {
      measurement_id: measurementId,
      event_category: "seo_growth",
      event_type: eventType,
      ...payload,
    });
  } catch {
    // ignore
  }
}

export function trackGrowthEvent(
  eventType: GrowthEventType,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  const enriched = {
    ...payload,
    session_id: getSessionId(),
    device: getAnalyticsDevice(),
    pathname: window.location.pathname,
    referrer: document.referrer || null,
    retargeting_pending: window.localStorage.getItem(RETARGETING_KEY) === "1",
  };

  const body = JSON.stringify({
    event_type: eventType,
    payload: enriched,
  });

  if (
    eventType === "seo_location_scroll" ||
    eventType === "seo_cta_click" ||
    eventType === "seo_service_card_click" ||
    eventType === "seo_faq_expand" ||
    eventType === "seo_pricing_interaction"
  ) {
    forwardToGa4(eventType, enriched);
  }

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
