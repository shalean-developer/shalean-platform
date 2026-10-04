import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";

export type BookingQuoteReadiness = {
  ready: boolean;
  reason?:
    | "catalog_loading"
    | "missing_quote"
    | "missing_price_lock"
    | "stale_price_lock"
    | "zero_quote"
    | "missing_duration";
  message?: string;
};

/**
 * Client gate before confirm/payment: refuse stale empty quotes and catalog-not-ready states.
 * Zero-cash after credits is allowed only when base/service subtotal was calculated (>0 duration).
 */
export function assessBookingQuoteReadiness(params: {
  catalogLoading: boolean;
  pricingSummary: CustomerPricingBreakdown | null | undefined;
  quoteLock?: { pricingVersionId?: string; quoteSignature?: string; lockedAt?: string; expiresAt?: string } | null;
  requirePriceLock?: boolean;
}): BookingQuoteReadiness {
  if (params.catalogLoading) {
    return {
      ready: false,
      reason: "catalog_loading",
      message: "Loading live pricing…",
    };
  }
  if (params.requirePriceLock) {
    const lock = params.quoteLock;
    if (
      !lock?.pricingVersionId?.trim() ||
      !lock.quoteSignature?.trim() ||
      !lock.lockedAt?.trim() ||
      !lock.expiresAt?.trim()
    ) {
      return {
        ready: false,
        reason: "missing_price_lock",
        message: "Refreshing your secured price…",
      };
    }
  }
  const p = params.pricingSummary;
  if (!p) {
    return {
      ready: false,
      reason: "missing_quote",
      message: "Your quote is missing. Refresh this page and try again.",
    };
  }
  if (
    params.requirePriceLock &&
    (!p.quote_signature?.trim() ||
      params.quoteLock?.quoteSignature?.trim() !== p.quote_signature.trim())
  ) {
    return {
      ready: false,
      reason: "stale_price_lock",
      message: "Finalising your estimated time and secured price…",
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


/**
 * Payment can safely recover a missing/stale lock because Step 4 refreshes the
 * authoritative quote before calling confirm. Other readiness failures remain
 * blocking because there is no usable quote to refresh from.
 */
export function canRefreshBookingQuoteAtPayment(
  readiness: BookingQuoteReadiness,
): boolean {
  return (
    !readiness.ready &&
    (readiness.reason === "missing_price_lock" ||
      readiness.reason === "stale_price_lock")
  );
}

export type BookingAuthoritativeQuoteRequestState = "loading" | "ready" | "error";

/** Review/payment may advance only after the latest authoritative quote request succeeded. */
export function authoritativeQuoteAllowsPaymentEntry(params: {
  requestState: BookingAuthoritativeQuoteRequestState;
  hasPendingBooking: boolean;
}): boolean {
  return params.hasPendingBooking || params.requestState === "ready";
}
