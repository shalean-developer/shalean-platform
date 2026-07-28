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
  trackGa4BeginCheckout,
  trackGa4BookingReview,
  trackGa4BookingStart,
  trackGa4ScheduleSelected,
  trackGa4ServiceSelected,
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
  const paymentStartedTracked = useRef(false);
  const ga4ScheduleTracked = useRef(false);
  const ga4ReviewTracked = useRef(false);
  const ga4CheckoutTracked = useRef(false);

  // Page-level growth + entry funnel view
  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
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
  }, [serviceSlug]);

  // Step views + semantic booking events
  useEffect(() => {
    if (funnelViewTracked.current.has(currentStep)) return;
    funnelViewTracked.current.add(currentStep);

    const funnelStep = bookingV2StepToFunnelStep(currentStep);
    const values = form.getValues();
    const state = bookingAnalyticsState(serviceSlug, values);

    trackBookingFunnelEvent(funnelStep, BOOKING_FUNNEL_ROW.VIEW, {
      service: serviceSlug,
      flow: "booking_v2",
      step: currentStep,
    });

    if (stepTracked.current.has(currentStep)) return;
    stepTracked.current.add(currentStep);

    const base = { step: currentStep, service: serviceSlug, flow: "booking_v2" };

    if (currentStep === 1) {
      trackGrowthEvent(ANALYTICS_EVENTS.START_BOOKING, base);
      trackGrowthEvent(ANALYTICS_EVENTS.VIEW_PRICE, base);
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_STEP_DETAILS_STARTED, state, {
        service_type: serviceSlug,
        suburb: values.suburb ?? null,
      });
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED, state, {
        service_type: serviceSlug,
        suburb: values.suburb ?? null,
      });
      trackGa4BookingStart({
        service: serviceSlug,
        value: state.finalPrice,
      });
      trackGa4ServiceSelected({
        service: serviceSlug,
        value: state.finalPrice,
      });
      return;
    }

    if (currentStep === 2) {
      trackGrowthEvent(ANALYTICS_EVENTS.SELECT_TIME, base);
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CONTINUE_SCHEDULE, state, {
        service_type: serviceSlug,
      });
      return;
    }

    if (currentStep === 3 && !ga4ReviewTracked.current) {
      ga4ReviewTracked.current = true;
      trackGa4BookingReview({
        service: serviceSlug,
        value: state.finalPrice,
      });
    }

    if (currentStep === 4 && !paymentStartedTracked.current) {
      paymentStartedTracked.current = true;
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED, state, {
        service_type: serviceSlug,
        suburb: values.suburb ?? null,
        estimated_price: state.finalPrice,
      });
      if (!ga4CheckoutTracked.current) {
        ga4CheckoutTracked.current = true;
        trackGa4BeginCheckout({
          service: serviceSlug,
          value: state.finalPrice,
        });
      }
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

      if (name === "time" && values.time && !timeTracked.current) {
        timeTracked.current = true;
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_TIME_SELECTED, state, {
          ...payload,
          date: values.date ?? null,
          time: values.time,
        });
        if (!ga4ScheduleTracked.current && values.date) {
          ga4ScheduleTracked.current = true;
          trackGa4ScheduleSelected({
            service: serviceSlug,
            value: state.finalPrice,
          });
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
