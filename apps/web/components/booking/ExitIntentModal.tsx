"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { getBookingSummaryServiceLabel } from "@/components/booking/serviceCategories";
import {
  formatLockedAppointmentLabel,
  getLockedBookingDisplayPrice,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";

type ExitIntentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Primary action — navigate to checkout, scroll to pay, or focus schedule. */
  onCompleteBooking: () => void;
};

function serviceLine(locked: LockedBooking | null, step1: BookingStep1State | null): string | null {
  if (locked?.service) {
    return getBookingSummaryServiceLabel(locked.service, locked.service_type);
  }
  if (step1?.service) {
    return getBookingSummaryServiceLabel(step1.service, step1.service_type);
  }
  return null;
}

export function ExitIntentModal({ open, onOpenChange, onCompleteBooking }: ExitIntentModalProps) {
  const { step, lockedBooking } = useBookingFlow();
  const step1 = usePersistedBookingSummaryState();
  const { canonicalTotalZar } = useBookingPrice();
  const primaryRef = useRef<HTMLButtonElement>(null);

  const estimateZar = canonicalTotalZar;

  const svcLabel = useMemo(() => serviceLine(lockedBooking, step1), [lockedBooking, step1]);

  const lockedWhenLabel = useMemo(
    () => (lockedBooking ? formatLockedAppointmentLabel(lockedBooking) : null),
    [lockedBooking],
  );

  const lockedPriceZar = useMemo(
    () => (lockedBooking ? getLockedBookingDisplayPrice(lockedBooking) : null),
    [lockedBooking],
  );

  /** Service + date/time only (price shown separately, highlighted). */
  const lockedSummarySansPrice = useMemo(() => {
    if (!lockedBooking || !svcLabel || !lockedWhenLabel) return null;
    return `${svcLabel} · ${lockedWhenLabel}`;
  }, [lockedBooking, svcLabel, lockedWhenLabel]);

  const unlockedSummaryLine = useMemo(() => {
    if (lockedBooking) return null;
    if (svcLabel && estimateZar != null) {
      return { beforePrice: `${svcLabel} · `, price: Math.round(estimateZar) };
    }
    if (svcLabel) return { beforePrice: `${svcLabel}`, price: null as number | null };
    if (estimateZar != null) return { beforePrice: "", price: Math.round(estimateZar) };
    return null;
  }, [lockedBooking, svcLabel, estimateZar]);

  const showUrgencyBadge = step === "when" || step === "checkout";

  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => primaryRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={dismiss}
      />
      <div className="relative z-[101] w-full max-w-lg rounded-xl border border-zinc-200/90 bg-white p-5 shadow-xl shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 sm:p-6">
        <div className="flex gap-4">
          <div
            className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex"
            aria-hidden
          >
            <Sparkles className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {showUrgencyBadge ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
                  Slots filling fast
                </span>
              ) : null}
            </div>
            <h2
              id="exit-intent-title"
              className="text-xl font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl"
            >
              Wait! Your booking is almost secured
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {lockedBooking ? (
                <>
                  <p>Your cleaner is still available for your selected time.</p>
                  <p>Complete your booking now before the slot is taken.</p>
                </>
              ) : (
                <>
                  <p>You&apos;re almost there — lock your slot while cleaners are still available.</p>
                  <p>Complete your booking to secure your chosen service and time.</p>
                </>
              )}
            </div>

            {/* Booking summary: service · date/time · highlighted price */}
            {lockedBooking && lockedSummarySansPrice != null && lockedPriceZar != null ? (
              <>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 sm:hidden">
                  {lockedSummarySansPrice}
                </p>
                <p className="text-sm sm:hidden">
                  <span className="font-semibold text-primary">
                    From R {lockedPriceZar.toLocaleString("en-ZA")}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400"> · No payment yet</span>
                </p>
                <p className="hidden text-sm font-medium text-zinc-800 dark:text-zinc-100 sm:block">
                  <span>{lockedSummarySansPrice} · </span>
                  <span className="font-semibold text-primary">
                    R {lockedPriceZar.toLocaleString("en-ZA")}
                  </span>
                </p>
              </>
            ) : unlockedSummaryLine ? (
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {unlockedSummaryLine.beforePrice ? (
                  <span>{unlockedSummaryLine.beforePrice}</span>
                ) : null}
                {unlockedSummaryLine.price != null ? (
                  <span className="font-semibold text-primary">
                    From R {unlockedSummaryLine.price.toLocaleString("en-ZA")}
                  </span>
                ) : null}
              </p>
            ) : null}

            {!lockedBooking ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 sm:hidden">
                Pick a time next to lock your slot and price.
              </p>
            ) : null}

            <ul className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:flex-wrap sm:gap-x-4">
              <li className="flex items-center gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                No payment required yet
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                Free reschedule if needed
              </li>
            </ul>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:pt-2">
              <button
                type="button"
                ref={primaryRef}
                onClick={() => {
                  onCompleteBooking();
                  onOpenChange(false);
                }}
                className="order-1 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:bg-primary/90 sm:order-2 sm:w-auto sm:px-6"
              >
                Complete booking →
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="order-2 text-center text-sm font-semibold text-zinc-600 underline decoration-zinc-400 underline-offset-4 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 sm:order-1 sm:text-left sm:no-underline sm:rounded-xl sm:border sm:border-zinc-200 sm:px-4 sm:py-3 sm:text-zinc-700 sm:dark:border-zinc-600 sm:dark:text-zinc-200 sm:dark:hover:bg-zinc-800"
              >
                Continue later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
