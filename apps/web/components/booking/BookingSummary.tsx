"use client";

import { useMemo } from "react";
import { lockedToStep1State } from "@/lib/booking/lockedBooking";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { BookingSummaryCard } from "./BookingSummaryCard";
import { useLockedBooking } from "./useLockedBooking";
import { useSelectedCleaner } from "./useSelectedCleaner";
import type { BookingStep1State } from "./useBookingStep1";
import { serviceSupportsCleaningFrequencyPlan } from "@/components/booking/serviceCategories";
import {
  applyCleaningFrequencyDisplayDiscount,
  cleaningFrequencyDiscountFraction,
  cleaningFrequencyPlanDisplayLabel,
} from "@/lib/booking/cleaningFrequencyDisplayDiscount";

type BookingSummaryProps = {
  state: BookingStep1State;
  /** Step 4: “When” line before lock (selected date). */
  scheduleDateHint?: string | null;
  /** Step 2: ignore `booking_locked` so the sidebar never shows a stale slot total. */
  ignoreLockedBooking?: boolean;
  /** When true and not locked, hide totals and prompt for a time slot (schedule step). */
  suppressEstimateUntilLocked?: boolean;
  /** Step 5: discounted total to pay (matches footer). */
  amountToPayZar?: number;
  /** Bottom sheet / inline: drop sticky positioning so the card scrolls naturally. */
  embedded?: boolean;
};

/**
 * Sticky shell for the booking summary card. Used in BookingLayout (desktop sidebar + mobile top).
 * When `booking_locked` exists, the amount comes from that snapshot only.
 */
export default function BookingSummary({
  state,
  scheduleDateHint = null,
  ignoreLockedBooking = false,
  suppressEstimateUntilLocked = false,
  amountToPayZar,
  embedded = false,
}: BookingSummaryProps) {
  const lockedRaw = useLockedBooking();
  const locked = ignoreLockedBooking ? null : lockedRaw;
  const selectedCleaner = useSelectedCleaner();
  const { canonicalTotalZar } = useBookingPrice();
  const displayState: BookingStep1State = locked ? lockedToStep1State(locked) : state;

  const estimateFromZar = useMemo(() => {
    if (locked || suppressEstimateUntilLocked) return null;
    return canonicalTotalZar;
  }, [locked, suppressEstimateUntilLocked, canonicalTotalZar]);

  const frequencyForPlan = useMemo(() => {
    if (!serviceSupportsCleaningFrequencyPlan(state.service, state.service_type)) return "one_time" as const;
    return state.cleaningFrequency;
  }, [state.service, state.service_type, state.cleaningFrequency]);

  const estimatePlanDiscountedZar = useMemo(() => {
    if (estimateFromZar == null) return null;
    if (cleaningFrequencyDiscountFraction(frequencyForPlan) <= 0) return null;
    return applyCleaningFrequencyDisplayDiscount(estimateFromZar, frequencyForPlan);
  }, [estimateFromZar, frequencyForPlan]);

  const estimatePlanLabel = useMemo(() => {
    if (estimatePlanDiscountedZar == null) return null;
    return cleaningFrequencyPlanDisplayLabel(frequencyForPlan);
  }, [estimatePlanDiscountedZar, frequencyForPlan]);

  return (
    <div
      className={
        embedded
          ? "static z-auto min-w-0 self-stretch"
          : "sticky top-24 z-10 min-w-0 self-start lg:static lg:self-stretch"
      }
    >
      <BookingSummaryCard
        state={displayState}
        scheduleDateHint={scheduleDateHint}
        suppressEstimateUntilLocked={suppressEstimateUntilLocked}
        locked={locked}
        selectedCleanerName={selectedCleaner?.name ?? null}
        estimateFromZar={estimateFromZar}
        estimatePlanDiscountedZar={estimatePlanDiscountedZar}
        estimatePlanLabel={estimatePlanLabel}
        amountToPayZar={amountToPayZar}
      />
    </div>
  );
}
