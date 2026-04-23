"use client";

import { useMemo } from "react";
import { lockedToStep1State } from "@/lib/booking/lockedBooking";
import { estimateFromSmartQuoteMin } from "@/lib/booking/smartQuoteEstimate";
import { BookingSummaryCard } from "./BookingSummaryCard";
import { useLockedBooking } from "./useLockedBooking";
import { useSelectedCleaner } from "./useSelectedCleaner";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import type { BookingStep1State } from "./useBookingStep1";

type BookingSummaryProps = {
  state: BookingStep1State;
  /** Step 2: ignore `booking_locked` so the sidebar never shows a stale slot total. */
  ignoreLockedBooking?: boolean;
  /** When true and not locked, hide totals and prompt for a time slot (schedule step). */
  suppressEstimateUntilLocked?: boolean;
  /** Step 5: discounted total to pay (matches footer). */
  amountToPayZar?: number;
};

/**
 * Sticky shell for the booking summary card. Used in BookingLayout (desktop sidebar + mobile top).
 * When `booking_locked` exists, the amount comes from that snapshot only.
 */
export default function BookingSummary({
  state,
  ignoreLockedBooking = false,
  suppressEstimateUntilLocked = false,
  amountToPayZar,
}: BookingSummaryProps) {
  const lockedRaw = useLockedBooking();
  const locked = ignoreLockedBooking ? null : lockedRaw;
  const selectedCleaner = useSelectedCleaner();
  const { tier } = useBookingVipTier();
  const displayState: BookingStep1State = locked ? lockedToStep1State(locked) : state;

  const estimateFromZar = useMemo(() => {
    if (locked || suppressEstimateUntilLocked) return null;
    return estimateFromSmartQuoteMin(displayState, tier);
  }, [displayState, locked, suppressEstimateUntilLocked, tier]);

  return (
    <div className="sticky top-24 z-10 min-w-0 self-start lg:static lg:self-stretch">
      <BookingSummaryCard
        state={displayState}
        suppressEstimateUntilLocked={suppressEstimateUntilLocked}
        locked={locked}
        selectedCleanerName={selectedCleaner?.name ?? null}
        estimateFromZar={estimateFromZar}
        amountToPayZar={amountToPayZar}
      />
    </div>
  );
}
