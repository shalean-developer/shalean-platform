import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";

export type BookingQuoteReadiness = {
  ready: boolean;
  reason?: "catalog_loading" | "missing_quote" | "zero_quote" | "missing_duration";
  message?: string;
};

/**
 * Client gate before confirm/payment: refuse stale empty quotes and catalog-not-ready states.
 * Zero-cash after credits is allowed only when base/service subtotal was calculated (>0 duration).
 */
export function assessBookingQuoteReadiness(params: {
  catalogLoading: boolean;
  pricingSummary: CustomerPricingBreakdown | null | undefined;
}): BookingQuoteReadiness {
  if (params.catalogLoading) {
    return {
      ready: false,
      reason: "catalog_loading",
      message: "Loading live pricing…",
    };
  }
  const p = params.pricingSummary;
  if (!p) {
    return {
      ready: false,
      reason: "missing_quote",
      message: "Your quote is missing. Refresh this page and try again.",
    };
  }
  const total =
    typeof p.estimated_total === "number"
      ? p.estimated_total
      : typeof p.total === "number"
        ? p.total
        : null;
  const duration = p.estimated_duration_minutes;
  if (typeof duration !== "number" || duration < 1) {
    return {
      ready: false,
      reason: "missing_duration",
      message: "We could not calculate your cleaning duration. Adjust rooms or refresh pricing.",
    };
  }
  if (typeof total !== "number" || (total <= 0 && (p.base_service_price ?? 0) <= 0)) {
    return {
      ready: false,
      reason: "zero_quote",
      message: "Your quote could not be calculated. Refresh pricing and try again.",
    };
  }
  return { ready: true };
}
