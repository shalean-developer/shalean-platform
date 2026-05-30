import type { BookingCheckoutSegment } from "@/lib/booking/bookingCheckoutGuards";
import { BOOKING_SEGMENT_INDEX } from "@/lib/booking/bookingCheckoutGuards";
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { calculatePrice, calculateSmartQuote, type CalculatePriceInput } from "@/lib/pricing/calculatePrice";
import { JOB_DURATION_QUOTE_ANCHOR_HM } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

export type CheckoutSummaryStep = 1 | 2 | 3 | 4;

export function hasCheckoutSelectedTime(time: string | null | undefined): boolean {
  return /^\d{1,2}:\d{2}$/.test(time?.trim() ?? "");
}

export function checkoutSummaryPriceLabel(step: CheckoutSummaryStep, hasSelectedTime: boolean): string {
  if (step === 4) return "TOTAL";
  if (hasSelectedTime && step >= 2) return "BOOKING PRICE";
  return "EST. PRICE";
}

export function segmentToCheckoutStep(segment: BookingCheckoutSegment): CheckoutSummaryStep {
  return (BOOKING_SEGMENT_INDEX[segment] + 1) as CheckoutSummaryStep;
}

function slotTimeOrAnchor(time: string | null | undefined): string {
  const t = time?.trim() ?? "";
  return /^\d{1,2}:\d{2}$/.test(t) ? t : JOB_DURATION_QUOTE_ANCHOR_HM;
}

export type CheckoutSidebarPriceResult = {
  step: CheckoutSummaryStep;
  hours: number;
  totalZar: number;
  /** True when total uses slot-aware smart quote (selected time). */
  slotPricingActive: boolean;
  priceLabel: string;
};

/**
 * Sidebar headline hours + ZAR. Uses base catalog quote until a time is selected;
 * once a time is chosen, uses checkout smart quote (demand / slot curve) on all steps.
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
}): CheckoutSidebarPriceResult {
  const step = segmentToCheckoutStep(args.segment);
  const hasSelectedTime = hasCheckoutSelectedTime(args.time);
  const priceLabel = checkoutSummaryPriceLabel(step, hasSelectedTime);

  if (!args.snapshot || !args.service) {
    return { step, hours: 0, totalZar: 0, slotPricingActive: false, priceLabel };
  }

  const input: CalculatePriceInput = {
    service: args.service,
    rooms: args.bedrooms,
    bathrooms: args.bathrooms,
    extraRooms: args.extraRooms,
    extras: args.extras,
  };

  if (!hasSelectedTime) {
    const p = calculatePrice(input, args.snapshot);
    return { step, hours: p.hours, totalZar: p.total, slotPricingActive: false, priceLabel };
  }

  const timeHm = slotTimeOrAnchor(args.time);
  const smart = calculateSmartQuote(input, args.snapshot, timeHm, "regular", {});
  return {
    step,
    hours: smart.hours,
    totalZar: smart.total,
    slotPricingActive: true,
    priceLabel,
  };
}
