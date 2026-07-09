import type { DurationWorkloadResult } from "@/lib/pricing/cleaningDurationWorkload";
import type { CheckoutQuoteResult } from "@/lib/pricing/pricingEngine";
import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";

/** Authoritative quote envelope — price and duration always computed together. */
export type BookingQuoteEnvelope = {
  calculation_version: number;
  duration_minutes: number;
  duration_hours: number;
  team_scaled_duration_minutes: number;
  cleaner_workload: number;
  customer_price_zar: number;
  quote_signature: string;
  duration_workload: DurationWorkloadResult;
};

export type BookingQuoteFunnel = "legacy" | "v2";

export type LegacyBookingQuoteResult = BookingQuoteEnvelope & {
  funnel: "legacy";
  checkout: CheckoutQuoteResult;
};

export type BookingV2QuoteResult = BookingQuoteEnvelope & {
  funnel: "v2";
  breakdown: CustomerPricingBreakdown;
};

export type BookingQuoteResult = LegacyBookingQuoteResult | BookingV2QuoteResult;

export class BookingQuoteSyncError extends Error {
  readonly code = "BOOKING_QUOTE_SYNC_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "BookingQuoteSyncError";
  }
}
