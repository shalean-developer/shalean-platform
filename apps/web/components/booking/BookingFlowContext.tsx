"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BOOKING_PROMO_QUERY,
  bookingFlowHref,
  type BookingFlowStep,
} from "@/lib/booking/bookingFlow";
import { clearLockedBookingFromStorage, type LockedBooking } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { bookingRouteToFunnelStep, trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { useLockedBooking } from "@/components/booking/useLockedBooking";

export type BookingFlowContextValue = {
  step: BookingFlowStep;
  /** Normalized promo from `?promo=` when present. */
  promoParam: string | null;
  /** Build `/booking/{segment}` href preserving `promo` and merging optional extra params. */
  bookingHref: (step: BookingFlowStep, extra?: Record<string, string>) => string;
  lockedBooking: LockedBooking | null;
  handleResetBooking: () => void;
  handleBack: () => void;
};

const BookingFlowContext = createContext<BookingFlowContextValue | null>(null);

export function BookingFlowProvider({
  step,
  promoParam,
  children,
}: {
  step: BookingFlowStep;
  promoParam: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const lockedBooking = useLockedBooking();

  const bookingHref = useCallback(
    (s: BookingFlowStep, extra?: Record<string, string>) =>
      bookingFlowHref(s, {
        ...(promoParam ? { [BOOKING_PROMO_QUERY]: promoParam } : {}),
        ...extra,
      }),
    [promoParam],
  );

  const goTo = useCallback(
    (s: BookingFlowStep) => {
      router.push(bookingHref(s));
    },
    [router, bookingHref],
  );

  const handleBack = useCallback(() => {
    trackBookingFunnelEvent(bookingRouteToFunnelStep(step), "back", { route_step: step });
    if (step === "quote") goTo("entry");
    else if (step === "details") goTo("quote");
    else if (step === "when") {
      clearLockedBookingFromStorage();
      goTo("details");
    } else if (step === "checkout") goTo("when");
  }, [step, goTo]);

  const handleResetBooking = useCallback(() => {
    clearLockedBookingFromStorage();
    clearSelectedCleanerFromStorage();
    if (step === "checkout") {
      goTo("when");
    }
  }, [step, goTo]);

  const value = useMemo(
    () => ({
      step,
      promoParam,
      bookingHref,
      lockedBooking,
      handleResetBooking,
      handleBack,
    }),
    [step, promoParam, bookingHref, lockedBooking, handleResetBooking, handleBack],
  );

  return <BookingFlowContext.Provider value={value}>{children}</BookingFlowContext.Provider>;
}

export function useBookingFlow(): BookingFlowContextValue {
  const ctx = useContext(BookingFlowContext);
  if (!ctx) {
    throw new Error("useBookingFlow must be used within BookingFlowProvider");
  }
  return ctx;
}

/** Alias matching product language (“booking” state for the flow). */
export const useBooking = useBookingFlow;
