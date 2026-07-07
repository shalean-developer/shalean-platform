"use client";

import { useEffect, useRef } from "react";
import type { BookingCheckoutSegment } from "@/lib/booking/bookingCheckoutGuards";
import {
  BOOKING_FUNNEL_ROW,
  bookingCheckoutSegmentToFunnelStep,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";

/** Funnel step telemetry for legacy `/booking/(checkout)/*` routes. */
export function useBookingCheckoutFunnelTelemetry(segment: BookingCheckoutSegment): void {
  const viewedRef = useRef<Set<BookingCheckoutSegment>>(new Set());
  const prevSegmentRef = useRef<BookingCheckoutSegment | null>(null);

  useEffect(() => {
    if (viewedRef.current.has(segment)) return;
    viewedRef.current.add(segment);
    trackBookingFunnelEvent(bookingCheckoutSegmentToFunnelStep(segment), BOOKING_FUNNEL_ROW.VIEW, {
      flow: "booking_checkout",
      segment,
    });
  }, [segment]);

  useEffect(() => {
    const prev = prevSegmentRef.current;
    prevSegmentRef.current = segment;
    if (prev == null || prev === segment) return;

    const prevIdx = ["details", "schedule", "cleaner", "payment"].indexOf(prev);
    const nextIdx = ["details", "schedule", "cleaner", "payment"].indexOf(segment);
    if (nextIdx > prevIdx) {
      trackBookingFunnelEvent(bookingCheckoutSegmentToFunnelStep(prev), BOOKING_FUNNEL_ROW.NEXT, {
        flow: "booking_checkout",
        from: prev,
        to: segment,
      });
    } else if (nextIdx < prevIdx) {
      trackBookingFunnelEvent(bookingCheckoutSegmentToFunnelStep(segment), BOOKING_FUNNEL_ROW.BACK, {
        flow: "booking_checkout",
        from: prev,
        to: segment,
      });
    }
  }, [segment]);

  useEffect(() => {
    function onExit() {
      if (segment === "payment") return;
      trackBookingFunnelEvent(bookingCheckoutSegmentToFunnelStep(segment), BOOKING_FUNNEL_ROW.EXIT, {
        flow: "booking_checkout",
        segment,
        reason: "page_unload",
      });
    }

    window.addEventListener("pagehide", onExit);
    return () => window.removeEventListener("pagehide", onExit);
  }, [segment]);
}
