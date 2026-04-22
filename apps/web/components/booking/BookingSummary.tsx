"use client";

import { useEffect, useState } from "react";
import { lockedToStep1State } from "@/lib/booking/lockedBooking";
import {
  readBookingPricePreviewFromStorage,
  type BookingPricePreviewLock,
} from "@/lib/booking/bookingPricePreview";
import { BookingSummaryCard } from "./BookingSummaryCard";
import { useLockedBooking } from "./useLockedBooking";
import { useSelectedCleaner } from "./useSelectedCleaner";
import type { BookingStep1State } from "./useBookingStep1";

type BookingSummaryProps = {
  state: BookingStep1State;
  showPricePreview?: boolean;
  /** When true and not locked, hide estimate and prompt for a time slot (Step 2). */
  suppressEstimateUntilLocked?: boolean;
};

/**
 * Sticky shell for the booking summary card. Used in BookingLayout (desktop sidebar + mobile top).
 * When `booking_locked` exists, line items and price come from that snapshot — never recalculated.
 */
export default function BookingSummary({
  state,
  showPricePreview = false,
  suppressEstimateUntilLocked = false,
}: BookingSummaryProps) {
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const displayState: BookingStep1State = locked ? lockedToStep1State(locked) : state;
  const [pricePreview, setPricePreview] = useState<BookingPricePreviewLock | null>(() =>
    typeof window !== "undefined" ? readBookingPricePreviewFromStorage() : null,
  );

  useEffect(() => {
    function sync() {
      setPricePreview(readBookingPricePreviewFromStorage());
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("booking-storage-sync", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("booking-storage-sync", sync);
    };
  }, []);

  return (
    <div className="sticky top-20 z-10 min-w-0 self-start lg:static lg:self-stretch">
      <BookingSummaryCard
        state={displayState}
        showPricePreview={showPricePreview}
        suppressEstimateUntilLocked={suppressEstimateUntilLocked}
        locked={locked}
        pricePreview={locked ? null : pricePreview}
        selectedCleanerName={selectedCleaner?.name ?? null}
      />
    </div>
  );
}
