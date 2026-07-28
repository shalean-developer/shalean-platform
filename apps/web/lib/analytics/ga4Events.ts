"use client";

import {
  GA4_BRANCH,
  GA4_CANONICAL_MEASUREMENT_ID,
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

function gaDisableKey(measurementId: string): string {
  return `ga-disable-${measurementId}`;
}

export function setGa4Disabled(disabled: boolean): void {
  if (typeof window === "undefined") return;
  const id = getGa4MeasurementId();
  (window as unknown as Record<string, boolean>)[gaDisableKey(id)] = disabled;
  // Also disable legacy id if a stale tab still had it configured
  (window as unknown as Record<string, boolean>)[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)] =
    disabled;
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

/** Secondary conversion — booking form submitted / payment initiated. */
export function trackGa4BookingSubmitted(ctx?: Ga4BookingContext): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED, withBookingContext(ctx));
}

export function trackGa4PhoneClick(): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.PHONE_CLICK, { branch: GA4_BRANCH });
}

export function trackGa4WhatsAppClick(): void {
  trackGa4Event(GA4_FUNNEL_EVENTS.WHATSAPP_CLICK, { branch: GA4_BRANCH });
}

/**
 * Client-side GA4 purchase is intentionally NOT exposed.
 * Purchase is fired once from the server Measurement Protocol after payment verification
 * (see sendGa4MeasurementPurchase) so refresh / webhook / callback retries cannot double-count.
 */
