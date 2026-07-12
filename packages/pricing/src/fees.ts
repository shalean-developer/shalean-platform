/**
 * Shared booking-v2 fee + recurring discount math.
 * Used by apps/web (SoT) and apps/customer-mobile (display mirror).
 */

export type RecurringDiscountRule = {
  type: "percent" | "fixed";
  value: number;
};

export type BookingV2ServiceFeeRule =
  | "flat"
  | "percent"
  | "percent_floor"
  | "optimized"
  | "none";

export type BookingV2FeesLike = {
  serviceFeeRule: BookingV2ServiceFeeRule;
  serviceFeeFlatCents: number;
  serviceFeePercent: number;
  recurringDiscounts: Record<string, RecurringDiscountRule>;
};

export function computeServiceFeeZar(
  subtotalBeforeServiceFee: number,
  feesConfig: BookingV2FeesLike,
): number {
  const rule = feesConfig.serviceFeeRule;
  if (rule === "none") return 0;

  const subtotalCents = Math.max(0, Math.round(subtotalBeforeServiceFee * 100));

  if (rule === "percent") {
    return Math.round((subtotalCents * feesConfig.serviceFeePercent) / 100) / 100;
  }
  if (rule === "percent_floor") {
    return Math.max(20, Math.round((subtotalCents * feesConfig.serviceFeePercent) / 100) / 100);
  }
  if (rule === "optimized") {
    const cents = Math.max(2000, Math.min(5000, Math.round(subtotalCents * 0.05)));
    return cents / 100;
  }
  return feesConfig.serviceFeeFlatCents / 100;
}

export function applyRecurringDiscountZar(
  amountBeforeDiscount: number,
  bookingType: "once_off" | "recurring",
  recurringFrequency: string,
  feesConfig: BookingV2FeesLike,
): number {
  if (bookingType !== "recurring" || !recurringFrequency) return 0;
  const rule = feesConfig.recurringDiscounts?.[recurringFrequency];
  if (!rule || rule.value <= 0) return 0;

  if (rule.type === "fixed") {
    return Math.min(Math.round(rule.value), Math.round(amountBeforeDiscount));
  }
  return Math.round((amountBeforeDiscount * rule.value) / 100);
}
