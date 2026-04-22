"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bookingFlowHref, type BookingFlowStep } from "@/lib/booking/bookingFlow";
import { clearLockedBookingFromStorage, type LockedBooking } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { useLockedBooking } from "@/components/booking/useLockedBooking";

export type BookingFlowContextValue = {
  step: BookingFlowStep;
  lockedBooking: LockedBooking | null;
  handleResetBooking: () => void;
  handleBack: () => void;
};

const BookingFlowContext = createContext<BookingFlowContextValue | null>(null);

export function BookingFlowProvider({
  step,
  children,
}: {
  step: BookingFlowStep;
  children: ReactNode;
}) {
  const router = useRouter();
  const lockedBooking = useLockedBooking();

  const goTo = useCallback(
    (s: BookingFlowStep) => {
      router.push(bookingFlowHref(s));
    },
    [router],
  );

  const handleBack = useCallback(() => {
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
      lockedBooking,
      handleResetBooking,
      handleBack,
    }),
    [step, lockedBooking, handleResetBooking, handleBack],
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
