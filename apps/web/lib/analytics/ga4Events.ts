"use client";

import {
  GA4_BRANCH,
  GA4_CANONICAL_MEASUREMENT_ID,
  GA4_LEGACY_MEASUREMENT_IDS,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { sanitizeGa4Params } from "@/lib/analytics/ga4Pii";

export const GA4_FUNNEL_EVENTS = {
  BOOKING_START: "booking_start",
  SERVICE_SELECTED: "service_selected",
  SCHEDULE_SELECTED: "schedule_selected",
  BOOKING_REVIEW: "booking_review",
  BEGIN_CHECKOUT: "begin_checkout",
  PURCHASE: "purchase",
  BOOKING_SUBMITTED: "booking_submitted",
  PHONE_CLICK: "phone_click",
  WHATSAPP_CLICK: "whatsapp_click",
} as const;

export type Ga4FunnelEventName = (typeof GA4_FUNNEL_EVENTS)[keyof typeof GA4_FUNNEL_EVENTS];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function gaDisableKey(measurementId: string): string {
  return `ga-disable-${measurementId}`;
}

/** Canonical + every legacy Measurement ID that must be silenced on internal routes. */
export function ga4DisableTargetIds(): string[] {
  const ids = new Set<string>([GA4_CANONICAL_MEASUREMENT_ID, ...GA4_LEGACY_MEASUREMENT_IDS]);
  const active = getGa4MeasurementId();
  if (active) ids.add(active);
  return [...ids];
}

/**
 * Toggle GA4 collection for internal app surfaces.
 * Sets `ga-disable-<id>` for the active ID, the canonical apex ID, and every legacy ID
 * (exactly once each — no duplicate assignment of the canonical key).
 */
export function setGa4Disabled(disabled: boolean): void {
  if (typeof window === "undefined") return;
  const flags = window as unknown as Record<string, boolean>;
  for (const id of ga4DisableTargetIds()) {
    flags[gaDisableKey(id)] = disabled;
  }
}

function canSendGa4(): boolean {
  if (typeof window === "undefined") return false;
  if (isGa4PathExcluded(window.location.pathname)) return false;
  const id = getGa4MeasurementId();
  if ((window as unknown as Record<string, boolean>)[gaDisableKey(id)]) return false;
  return true;
}

/**
 * Fire a GA4 event via gtag (and mirror to dataLayer for GTM listeners).
 * Params are PII-scrubbed. No-ops on excluded paths / when gtag is unavailable.
 */
export function trackGa4Event(
  eventName: string,
  params: Record<string, unknown> = {},
): void {
  if (!canSendGa4()) return;

  const safe = sanitizeGa4Params({
    branch: GA4_BRANCH,
    ...params,
  });

  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...safe,
    });
  } catch {
    /* ignore */
  }

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, {
        send_to: getGa4MeasurementId(),
        ...safe,
      });
    }
  } catch {
    /* ignore */
  }
}

export type Ga4BookingContext = {
  service?: string | null;
  value?: number | null;
  currency?: string | null;
};

function withBookingContext(ctx: Ga4BookingContext = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { branch: GA4_BRANCH };
  const service = typeof ctx.service === "string" ? ctx.service.trim() : "";
  if (service) out.service = service;
  if (typeof ctx.value === "number" && Number.isFinite(ctx.value) && ctx.value > 0) {
    out.value = ctx.value;
  }
  out.currency = (ctx.currency?.trim() || "ZAR").toUpperCase();
  return out;
}

/** Customer booking funnel — fire once per step from the booking UI. */
export function trackGa4BookingStart(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.BOOKING_START, withBookingContext(ctx));
}

export function trackGa4ServiceSelected(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.SERVICE_SELECTED, withBookingContext(ctx));
}

export function trackGa4ScheduleSelected(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.SCHEDULE_SELECTED, withBookingContext(ctx));
}

export function trackGa4BookingReview(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.BOOKING_REVIEW, withBookingContext(ctx));
}

export function trackGa4BeginCheckout(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.BEGIN_CHECKOUT, withBookingContext(ctx));
}

/** Secondary conversion — only after a real booking is accepted/created (once per booking id). */
export function trackGa4BookingSubmitted(
  ctx: Ga4BookingContext & { bookingId: string; reference?: string | null },
): void {
  const bookingId = typeof ctx.bookingId === "string" ? ctx.bookingId.trim() : "";
  if (!bookingId) return;

  if (typeof window !== "undefined") {
    const key = `shalean_ga4_booking_submitted_${bookingId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* still fire once for this call if storage unavailable */
    }
  }

  trackGa4Event(GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED, withBookingContext(ctx));
}

export function trackGa4PhoneClick(): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.PHONE_CLICK, { branch: GA4_BRANCH });
}

export function trackGa4WhatsAppClick(): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.WHATSAPP_CLICK, { branch: GA4_BRANCH });
}

/**
 * Client-side GA4 `purchase` helper is not part of this browser-infra PR.
 * Existing checkout still uses `trackClientPurchase` (Meta/Ads/dataLayer).
 * Durable server Measurement Protocol purchase + identity stitching is a follow-up PR.
 */
