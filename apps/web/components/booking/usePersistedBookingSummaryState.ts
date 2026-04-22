"use client";

import { useEffect, useState } from "react";
import type { BookingStep1State } from "./useBookingStep1";
import { loadBookingStep1FromStorage } from "./useBookingStep1";

/**
 * Hydrates booking snapshot from `localStorage` for pages that don’t own the step-1 hook (e.g. Step 2).
 * Initial render is always `null` (matches SSR) — read storage in `useEffect` to avoid hydration mismatch.
 * Recalculates when other tabs update storage; same-tab updates rely on navigation remounts.
 */
export function usePersistedBookingSummaryState(): BookingStep1State | null {
  const [state, setState] = useState<BookingStep1State | null>(() =>
    typeof window !== "undefined" ? loadBookingStep1FromStorage() : null,
  );

  useEffect(() => {
    function sync() {
      setState(loadBookingStep1FromStorage());
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("booking-storage-sync", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("booking-storage-sync", sync);
    };
  }, []);

  return state;
}
