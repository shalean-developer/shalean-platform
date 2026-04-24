import type { BookingStep1State } from "@/components/booking/useBookingStep1";

/** Per-visit plan discount for UI display only — engine / checkout use their own paths. */
export const CLEANING_FREQUENCY_DISCOUNT_FRACTION: Record<BookingStep1State["cleaningFrequency"], number> = {
  one_time: 0,
  weekly: 0.1,
  biweekly: 0.05,
  monthly: 0,
};

export function cleaningFrequencyDiscountFraction(
  frequency: BookingStep1State["cleaningFrequency"],
): number {
  return CLEANING_FREQUENCY_DISCOUNT_FRACTION[frequency] ?? 0;
}

export function applyCleaningFrequencyDisplayDiscount(
  baseZar: number,
  frequency: BookingStep1State["cleaningFrequency"],
): number {
  const d = cleaningFrequencyDiscountFraction(frequency);
  return Math.round(baseZar * (1 - d));
}

/** Short phrase for “with …” line under the list price. */
export function cleaningFrequencyPlanDisplayLabel(
  frequency: BookingStep1State["cleaningFrequency"],
): string | null {
  if (frequency === "weekly") return "weekly plan (10% off)";
  if (frequency === "biweekly") return "every 2 weeks plan (5% off)";
  return null;
}
