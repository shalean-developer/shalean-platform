"use client";

import { captureAcquisitionFirstTouchIfNeeded, getAcquisitionPayloadFields } from "@/lib/analytics/acquisitionContext";
import { tagReplay } from "@/lib/analytics/sessionReplay";
import { getAnalyticsSessionId } from "@/lib/analytics/sessionId";
import { ANALYTICS_EVENTS, type AnalyticsClientEventName } from "@/lib/analytics/userEventRegistry";

export type GrowthEventType = AnalyticsClientEventName;

const RETARGETING_KEY = "shalean_retargeting_pending";

export type AnalyticsDevice = "mobile" | "desktop";

export function getGrowthSessionId(): string {
  return getAnalyticsSessionId();
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
    sessionId: getAnalyticsSessionId(),
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

/** SEO growth signals for GTM → GA4 (no direct `gtag` / measurement id in the app bundle). */
function pushSeoGrowthEventToDataLayer(eventType: GrowthEventType, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const name =
    eventType === ANALYTICS_EVENTS.SEO_LOCATION_SCROLL
      ? "seo_scroll_depth"
      : eventType === ANALYTICS_EVENTS.SEO_CTA_CLICK
        ? "seo_cta_click"
        : eventType === ANALYTICS_EVENTS.SEO_SERVICE_CARD_CLICK
          ? "seo_service_click"
          : eventType === ANALYTICS_EVENTS.SEO_FAQ_EXPAND
            ? "seo_faq_expand"
            : eventType === ANALYTICS_EVENTS.SEO_PRICING_INTERACTION
              ? "seo_pricing_click"
              : eventType;
  try {
    type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };
    const w = window as DataLayerWindow;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: name,
      event_category: "seo_growth",
      event_type: eventType,
      ...payload,
    });
  } catch {
    // ignore
  }
}

function syncReplayProviders(sessionId: string): void {
  tagReplay("analytics_session_id", sessionId.slice(0, 255));
}

export function trackGrowthEvent(
  eventType: GrowthEventType,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  captureAcquisitionFirstTouchIfNeeded();
  const sid = getAnalyticsSessionId();
  syncReplayProviders(sid);
  const enriched = {
    ...getAcquisitionPayloadFields(),
    ...payload,
    session_id: sid,
    analytics_session_id: sid,
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
    eventType === ANALYTICS_EVENTS.SEO_LOCATION_SCROLL ||
    eventType === ANALYTICS_EVENTS.SEO_CTA_CLICK ||
    eventType === ANALYTICS_EVENTS.SEO_SERVICE_CARD_CLICK ||
    eventType === ANALYTICS_EVENTS.SEO_FAQ_EXPAND ||
    eventType === ANALYTICS_EVENTS.SEO_PRICING_INTERACTION
  ) {
    pushSeoGrowthEventToDataLayer(eventType, enriched);
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
