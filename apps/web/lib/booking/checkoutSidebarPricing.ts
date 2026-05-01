import type { BookingCheckoutSegment } from "@/lib/booking/bookingCheckoutGuards";
import { BOOKING_SEGMENT_INDEX } from "@/lib/booking/bookingCheckoutGuards";
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { calculatePrice, calculateSmartQuote, type CalculatePriceInput } from "@/lib/pricing/calculatePrice";
import { JOB_DURATION_QUOTE_ANCHOR_HM } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

export type CheckoutSummaryStep = 1 | 2 | 3 | 4;

export const CHECKOUT_SUMMARY_PRICE_LABEL: Record<CheckoutSummaryStep, string> = {
  1: "EST. PRICE",
  2: "EST. PRICE",
  3: "BOOKING PRICE",
  4: "TOTAL",
};

export function checkoutSummaryPriceLabel(step: CheckoutSummaryStep): string {
  return CHECKOUT_SUMMARY_PRICE_LABEL[step];
}

export function segmentToCheckoutStep(segment: BookingCheckoutSegment): CheckoutSummaryStep {
  return (BOOKING_SEGMENT_INDEX[segment] + 1) as CheckoutSummaryStep;
}

function slotTimeOrAnchor(time: string | null | undefined): string {
  const t = time?.trim() ?? "";
  return /^\d{1,2}:\d{2}$/.test(t) ? t : JOB_DURATION_QUOTE_ANCHOR_HM;
}

/**
 * Sidebar headline hours + ZAR: steps 1–2 use base catalog quote (no slot surge);
 * steps 3–4 use checkout quote for the selected time (demand / slot curve).
 */
export function checkoutSidebarPriceDisplay(args: {
  snapshot: PricingRatesSnapshot | null;
  segment: BookingCheckoutSegment;
  service: BookingServiceId | null;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  time: string | null;
}): { step: CheckoutSummaryStep; hours: number; totalZar: number } {
  const step = segmentToCheckoutStep(args.segment);

  if (!args.snapshot || !args.service) {
    return { step, hours: 0, totalZar: 0 };
  }

  const input: CalculatePriceInput = {
    service: args.service,
    rooms: args.bedrooms,
    bathrooms: args.bathrooms,
    extraRooms: args.extraRooms,
    extras: args.extras,
  };

  if (step <= 2) {
    const p = calculatePrice(input, args.snapshot);
    return { step, hours: p.hours, totalZar: p.total };
  }

  const timeHm = slotTimeOrAnchor(args.time);
  const smart = calculateSmartQuote(input, args.snapshot, timeHm, "regular", {});
  return { step, hours: smart.hours, totalZar: smart.total };
}
