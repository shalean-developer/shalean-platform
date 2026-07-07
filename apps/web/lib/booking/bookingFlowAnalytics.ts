"use client";

import type { BookingFlowStep } from "@/lib/booking/bookingFlow";
import {
  bookingExperimentLabel,
  getBookingExperimentAssignments,
} from "@/lib/booking/bookingExperiments";
import { BOOKING_FUNNEL_ROW, type BookingFunnelRowUi } from "@/lib/analytics/bookingEventsRegistry";
import { CANONICAL_BOOKING_SEMANTIC_ORDER } from "@/lib/analytics/bookingAnalyticsTruth";
import { BOOKING_FUNNEL_SESSION_LS_KEY, getAnalyticsSessionId } from "@/lib/analytics/sessionId";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

export { ANALYTICS_EVENTS, BOOKING_FUNNEL_SESSION_LS_KEY, BOOKING_FUNNEL_ROW, CANONICAL_BOOKING_SEMANTIC_ORDER };

/**
 * Product funnel labels (DB). Maps to routes: entry, quote, details→extras, when→datetime, checkout→payment.
 * `details` is reserved for future sub-step tracking (contact); checkout is tracked as `payment`.
 */
export type BookingFunnelStepLabel = "entry" | "quote" | "extras" | "datetime" | "details" | "payment";

export type BookingFunnelEventType = BookingFunnelRowUi;

export type BookingAnalyticsEventType =
  | typeof ANALYTICS_EVENTS.BOOKING_STEP_DETAILS_STARTED
  | typeof ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED
  | typeof ANALYTICS_EVENTS.BOOKING_ADDON_SELECTED
  | typeof ANALYTICS_EVENTS.BOOKING_CONTINUE_SCHEDULE
  | typeof ANALYTICS_EVENTS.BOOKING_DATE_SELECTED
  | typeof ANALYTICS_EVENTS.BOOKING_TIME_SELECTED
  | typeof ANALYTICS_EVENTS.BOOKING_CLEANER_SELECTED
  | typeof ANALYTICS_EVENTS.BOOKING_CTA_CLICKED
  | typeof ANALYTICS_EVENTS.BOOKING_VALIDATION_FAILED
  | typeof ANALYTICS_EVENTS.BOOKING_SCHEDULE_FETCH_FAILED
  | typeof ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED
  | typeof ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED
  | typeof ANALYTICS_EVENTS.BOOKING_RECOVERY_PROMPT_SHOWN
  | typeof ANALYTICS_EVENTS.BOOKING_RECOVERY_SAVED
  | typeof ANALYTICS_EVENTS.BOOKING_RECOVERY_WHATSAPP_CLICKED
  | typeof ANALYTICS_EVENTS.BOOKING_COMPLETED;

export type BookingAnalyticsState = {
  service?: string | null;
  service_type?: string | null;
  serviceAreaName?: string | null;
  finalPrice?: number | null;
  finalHours?: number | null;
  extras?: string[] | null;
};

export type BookingAnalyticsPayload = {
  service_type?: string | null;
  suburb?: string | null;
  estimated_price?: number | null;
  estimated_hours?: number | null;
  selected_extras?: string[];
  cleaner_mode?: "auto" | "manual";
  [key: string]: unknown;
};

export function bookingRouteToFunnelStep(route: BookingFlowStep): BookingFunnelStepLabel {
  switch (route) {
    case "entry":
      return "entry";
    case "quote":
      return "quote";
    case "details":
      return "extras";
    case "when":
      return "datetime";
    case "checkout":
      return "payment";
    default:
      return "quote";
  }
}

/** Maps booking-v2 wizard steps (`/book/[service]?step=N`) to `booking_events.step` labels. */
export function bookingV2StepToFunnelStep(step: 1 | 2 | 3 | 4): BookingFunnelStepLabel {
  switch (step) {
    case 1:
      return "quote";
    case 2:
      return "datetime";
    case 3:
      return "details";
    case 4:
      return "payment";
    default:
      return "quote";
  }
}

/** Maps legacy checkout URL segments to `booking_events.step` labels. */
export function bookingCheckoutSegmentToFunnelStep(
  segment: "details" | "schedule" | "cleaner" | "payment",
): BookingFunnelStepLabel {
  switch (segment) {
    case "details":
      return "quote";
    case "schedule":
      return "datetime";
    case "cleaner":
      return "details";
    case "payment":
      return "payment";
    default:
      return "quote";
  }
}

export function getOrCreateBookingFunnelSessionId(): string {
  return getAnalyticsSessionId();
}

function getBookingDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  try {
    const width = window.innerWidth || document.documentElement.clientWidth || 1280;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  } catch {
    return "desktop";
  }
}

function getBookingSource(): string {
  if (typeof window === "undefined") return "server";
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source")?.trim();
    const utmMedium = params.get("utm_medium")?.trim();
    const utmCampaign = params.get("utm_campaign")?.trim();
    if (utmSource) return [utmSource, utmMedium, utmCampaign].filter(Boolean).join("/");
    const promo = params.get("promo")?.trim();
    if (promo) return `promo:${promo}`;
    return document.referrer || "direct";
  } catch {
    return "unknown";
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function trackBookingAnalyticsEvent(
  eventType: BookingAnalyticsEventType,
  state: BookingAnalyticsState | null | undefined = {},
  payload: BookingAnalyticsPayload = {},
): void {
  if (typeof window === "undefined") return;
  const bookingSessionId = getOrCreateBookingFunnelSessionId();
  if (!bookingSessionId) return;

  const serviceType = payload.service_type ?? state?.service_type ?? state?.service ?? null;
  const selectedExtras = payload.selected_extras ?? (Array.isArray(state?.extras) ? state.extras : []);
  const estimatedPrice = payload.estimated_price ?? finiteNumber(state?.finalPrice) ?? null;
  const estimatedHours = payload.estimated_hours ?? finiteNumber(state?.finalHours) ?? null;
  const experimentAssignments = getBookingExperimentAssignments(bookingSessionId);

  trackGrowthEvent(eventType, {
    ...payload,
    booking_session_id: bookingSessionId,
    analytics_session_id: bookingSessionId,
    experiment_id: "booking_ab",
    variant_id: bookingExperimentLabel(experimentAssignments),
    device_type: getBookingDeviceType(),
    service_type: serviceType,
    source: getBookingSource(),
    suburb: payload.suburb ?? state?.serviceAreaName ?? null,
    estimated_price: estimatedPrice,
    estimated_hours: estimatedHours,
    selected_extras: selectedExtras,
    cleaner_mode: payload.cleaner_mode ?? "auto",
    booking_ab_variants: experimentAssignments,
    booking_ab_variant_key: bookingExperimentLabel(experimentAssignments),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Fire-and-forget funnel event → `booking_events` via API.
 * @param step — funnel label (quote, extras, datetime, payment, …)
 */
export function trackBookingFunnelEvent(
  step: BookingFunnelStepLabel,
  eventType: BookingFunnelEventType,
  metadata: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  const session_id = getAnalyticsSessionId();
  if (!session_id || session_id === "server") return;
  const experimentAssignments = getBookingExperimentAssignments(session_id);

  const payload = {
    session_id,
    analytics_session_id: session_id,
    step,
    event_type: eventType,
    metadata: {
      ...metadata,
      analytics_session_id: session_id,
      experiment_id: "booking_ab",
      variant_id: bookingExperimentLabel(experimentAssignments),
      booking_ab_variants: experimentAssignments,
      booking_ab_variant_key: bookingExperimentLabel(experimentAssignments),
      pathname: window.location.pathname,
      href: window.location.href,
    },
  };

  if (process.env.NODE_ENV === "development") {
    console.debug("[booking-funnel]", payload);
  }

  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/analytics/booking-event",
        new Blob([body], { type: "application/json" }),
      );
      if (ok) return;
    }
  } catch {
    /* fall through */
  }

  void fetch("/api/analytics/booking-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
