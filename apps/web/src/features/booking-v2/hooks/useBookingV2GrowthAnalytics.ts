"use client";

import { useEffect, useRef } from "react";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { markRetargetingCandidate, trackGrowthEvent } from "@/lib/growth/trackEvent";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

/** Funnel events for `/book/[service]` — feeds marketing dashboard `user_events`. */
export function useBookingV2GrowthAnalytics(currentStep: number, serviceSlug: ServiceSlug): void {
  const pageViewTracked = useRef(false);
  const stepTracked = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
    markRetargetingCandidate(true);
    trackGrowthEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
      page_type: "booking_flow_v2",
      service: serviceSlug,
      flow: "booking_v2",
    });
  }, [serviceSlug]);

  useEffect(() => {
    if (stepTracked.current.has(currentStep)) return;
    stepTracked.current.add(currentStep);

    const base = { step: currentStep, service: serviceSlug, flow: "booking_v2" };

    if (currentStep === 1) {
      trackGrowthEvent(ANALYTICS_EVENTS.START_BOOKING, base);
      trackGrowthEvent(ANALYTICS_EVENTS.VIEW_PRICE, base);
      return;
    }
    if (currentStep === 2) {
      trackGrowthEvent(ANALYTICS_EVENTS.SELECT_TIME, base);
    }
  }, [currentStep, serviceSlug]);
}
