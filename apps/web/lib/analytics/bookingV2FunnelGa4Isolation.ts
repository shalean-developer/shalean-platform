import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import {
  trackGa4BeginCheckout,
  trackGa4BookingStart,
  trackGa4ServiceSelected,
} from "@/lib/analytics/ga4Events";
import { trackBookingAnalyticsEvent } from "@/lib/booking/bookingFlowAnalytics";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

type BookingAnalyticsState = {
  service?: string | null;
  service_type?: string | null;
  serviceAreaName?: string | null;
  finalPrice?: number | null;
  extras?: string[] | null;
};

type BookingV2StepBase = {
  step: number;
  service: ServiceSlug;
  flow: "booking_v2";
};

/**
 * Step-1 funnel telemetry — GA4 booking_start / service_selected must fire even when
 * growth or booking analytics storage paths throw (e.g. SecurityError).
 */
export function trackBookingV2Step1Ga4First(
  serviceSlug: ServiceSlug,
  state: BookingAnalyticsState,
  values: { suburb?: string },
  base: BookingV2StepBase,
): void {
  trackGa4BookingStart({
    service: serviceSlug,
    value: state.finalPrice,
  });
  trackGa4ServiceSelected({
    service: serviceSlug,
    value: state.finalPrice,
  });
  try {
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
  } catch {
    // legacy / storage-dependent telemetry must not suppress GA4 above
  }
}

/**
 * Step-4 funnel telemetry — GA4 begin_checkout must fire even when booking analytics throws.
 */
export function trackBookingV2Step4Ga4First(
  serviceSlug: ServiceSlug,
  state: BookingAnalyticsState,
  values: { suburb?: string },
): void {
  trackGa4BeginCheckout({
    service: serviceSlug,
    value: state.finalPrice,
  });
  try {
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED, state, {
      service_type: serviceSlug,
      suburb: values.suburb ?? null,
      estimated_price: state.finalPrice,
    });
  } catch {
    // legacy / storage-dependent telemetry must not suppress GA4 above
  }
}
