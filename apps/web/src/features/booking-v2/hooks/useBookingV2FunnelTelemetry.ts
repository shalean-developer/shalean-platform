"use client";

import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import {
  BOOKING_FUNNEL_ROW,
  bookingV2StepToFunnelStep,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { markRetargetingCandidate, trackGrowthEvent } from "@/lib/growth/trackEvent";
import {
  trackBookingV2Step1Ga4First,
  trackBookingV2Step4Ga4First,
} from "@/lib/analytics/bookingV2FunnelGa4Isolation";
import {
  trackGa4BookingReview,
  trackGa4ScheduleSelected,
} from "@/lib/analytics/ga4Events";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingStep, BookingV2FormData } from "@/src/features/booking-v2/types";

type BookingV2Values = Partial<{
  suburb: string;
  selectedExtras: string[];
  selectedCleanerIds: string[];
  date: string;
  time: string;
  pricingSummary: { estimated_total?: number | null; total?: number | null } | null;
}>;

function bookingAnalyticsState(
  serviceSlug: ServiceSlug,
  values: BookingV2Values,
): {
  service?: string | null;
  service_type?: string | null;
  serviceAreaName?: string | null;
  finalPrice?: number | null;
  extras?: string[] | null;
} {
  return {
    service: serviceSlug,
    service_type: serviceSlug,
    serviceAreaName: values.suburb ?? null,
    finalPrice: values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? null,
    extras: values.selectedExtras ?? null,
  };
}

/**
 * Booking-v2 funnel telemetry — feeds `booking_events` (view/next/back/exit/error) and semantic
 * `user_events` (service_selected, date_selected, …) for Funnel Intelligence dashboards.
 */
export function useBookingV2FunnelTelemetry(currentStep: BookingStep, serviceSlug: ServiceSlug): void {
  const form = useFormContext<BookingV2FormData>();
  const pageViewTracked = useRef(false);
  const stepTracked = useRef<Set<number>>(new Set());
  const funnelViewTracked = useRef<Set<number>>(new Set());
  const prevStepRef = useRef<BookingStep | null>(null);
  const dateTracked = useRef(false);
  const timeTracked = useRef(false);
  const cleanerTracked = useRef(false);
  const ga4Step1Tracked = useRef(false);
  const ga4ScheduleTracked = useRef(false);
  const ga4ReviewTracked = useRef(false);
  const ga4CheckoutTracked = useRef(false);

  // Page-level growth + entry funnel view (storage-safe — must never block GA4 step effects)
  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
    try {
      markRetargetingCandidate(true);
      trackGrowthEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
        page_type: "booking_flow_v2",
        service: serviceSlug,
        flow: "booking_v2",
      });
      trackBookingFunnelEvent("entry", BOOKING_FUNNEL_ROW.VIEW, {
        service: serviceSlug,
        flow: "booking_v2",
      });
    } catch {
      // Growth/storage telemetry must not escape this effect or suppress sibling GA4 effects
    }
  }, [serviceSlug]);

  // Step views + semantic booking events
  useEffect(() => {
    const values = form.getValues();
    const state = bookingAnalyticsState(serviceSlug, values);
    const base = { step: currentStep, service: serviceSlug, flow: "booking_v2" as const };

    // GA4 funnel events first — independent of storage-backed growth / funnel telemetry
    if (currentStep === 1 && !ga4Step1Tracked.current) {
      trackBookingV2Step1Ga4First(serviceSlug, state, values, base);
      ga4Step1Tracked.current = true;
    } else if (currentStep === 3 && !ga4ReviewTracked.current) {
      trackGa4BookingReview({
        service: serviceSlug,
        value: state.finalPrice,
      });
      ga4ReviewTracked.current = true;
    } else if (currentStep === 4 && !ga4CheckoutTracked.current) {
      trackBookingV2Step4Ga4First(serviceSlug, state, values);
      ga4CheckoutTracked.current = true;
    }

    if (funnelViewTracked.current.has(currentStep)) return;
    funnelViewTracked.current.add(currentStep);

    try {
      const funnelStep = bookingV2StepToFunnelStep(currentStep);
      trackBookingFunnelEvent(funnelStep, BOOKING_FUNNEL_ROW.VIEW, {
        service: serviceSlug,
        flow: "booking_v2",
        step: currentStep,
      });

      if (stepTracked.current.has(currentStep)) return;
      stepTracked.current.add(currentStep);

      if (currentStep === 2) {
        trackGrowthEvent(ANALYTICS_EVENTS.SELECT_TIME, base);
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CONTINUE_SCHEDULE, state, {
          service_type: serviceSlug,
        });
      }
    } catch {
      // storage-dependent telemetry must not suppress GA4 above
    }
  }, [currentStep, serviceSlug, form]);

  // Navigation direction (next / back)
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = currentStep;
    if (prev == null || prev === currentStep) return;

    if (currentStep > prev) {
      trackBookingFunnelEvent(bookingV2StepToFunnelStep(prev), BOOKING_FUNNEL_ROW.NEXT, {
        service: serviceSlug,
        flow: "booking_v2",
        from_step: prev,
        to_step: currentStep,
      });
    } else {
      trackBookingFunnelEvent(bookingV2StepToFunnelStep(currentStep), BOOKING_FUNNEL_ROW.BACK, {
        service: serviceSlug,
        flow: "booking_v2",
        from_step: prev,
        to_step: currentStep,
      });
    }
  }, [currentStep, serviceSlug]);

  // Field-level semantic events (date, time, cleaner, extras)
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      const state = bookingAnalyticsState(serviceSlug, values);
      const payload = {
        service_type: serviceSlug,
        suburb: values.suburb ?? null,
        estimated_price: state.finalPrice,
      };

      if (name === "selectedExtras" && values.selectedExtras?.length) {
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_ADDON_SELECTED, state, {
          ...payload,
          selected_extras: values.selectedExtras,
        });
      }

      if (name === "date" && values.date && !dateTracked.current) {
        dateTracked.current = true;
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_DATE_SELECTED, state, {
          ...payload,
          date: values.date,
        });
      }

      if (name === "time" && values.time) {
        if (!ga4ScheduleTracked.current && values.date) {
          trackGa4ScheduleSelected({
            service: serviceSlug,
            value: state.finalPrice,
          });
          ga4ScheduleTracked.current = true;
        }
        if (!timeTracked.current) {
          timeTracked.current = true;
          try {
            trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_TIME_SELECTED, state, {
              ...payload,
              date: values.date ?? null,
              time: values.time,
            });
          } catch {
            // storage-dependent telemetry must not suppress schedule_selected
          }
        }
      }

      if (name === "selectedCleanerIds" && values.selectedCleanerIds?.length && !cleanerTracked.current) {
        cleanerTracked.current = true;
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CLEANER_SELECTED, state, {
          ...payload,
          cleaner_id: values.selectedCleanerIds.join(","),
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [form, serviceSlug]);

  // Abandonment / exit when leaving mid-flow
  useEffect(() => {
    function onExit() {
      if (currentStep >= 4) return;
      const funnelStep = bookingV2StepToFunnelStep(currentStep);
      trackBookingFunnelEvent(funnelStep, BOOKING_FUNNEL_ROW.EXIT, {
        service: serviceSlug,
        flow: "booking_v2",
        step: currentStep,
        reason: "page_unload",
      });
    }

    window.addEventListener("pagehide", onExit);
    return () => window.removeEventListener("pagehide", onExit);
  }, [currentStep, serviceSlug]);
}
