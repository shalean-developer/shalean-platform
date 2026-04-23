"use client";

import type { BookingFlowStep } from "@/lib/booking/bookingFlow";

/** Persisted UUID for one booking funnel attempt (localStorage). */
export const BOOKING_FUNNEL_SESSION_LS_KEY = "shalean_booking_funnel_session_id";

/**
 * Product funnel labels (DB). Maps to routes: entry, quote, details→extras, when→datetime, checkout→payment.
 * `details` is reserved for future sub-step tracking (contact); checkout is tracked as `payment`.
 */
export type BookingFunnelStepLabel = "entry" | "quote" | "extras" | "datetime" | "details" | "payment";

export type BookingFunnelEventType = "view" | "next" | "back" | "error" | "exit";

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

export function getOrCreateBookingFunnelSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(BOOKING_FUNNEL_SESSION_LS_KEY);
    if (!id || id.length < 8) {
      id = crypto.randomUUID();
      window.localStorage.setItem(BOOKING_FUNNEL_SESSION_LS_KEY, id);
    }
    return id;
  } catch {
    return `sess_${Math.random().toString(36).slice(2)}`;
  }
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
  const session_id = getOrCreateBookingFunnelSessionId();
  if (!session_id) return;

  const payload = {
    session_id,
    step,
    event_type: eventType,
    metadata: {
      ...metadata,
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
