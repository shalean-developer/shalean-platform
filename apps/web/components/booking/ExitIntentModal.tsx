"use client";

import { X } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

  const lockedSummaryOneLine = useMemo(() => {
    if (!lockedBooking || !svcLabel || !lockedWhenLabel) return null;
    return `${svcLabel} · ${lockedWhenLabel}`;
  }, [lockedBooking, svcLabel, lockedWhenLabel]);

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
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className={cn(
          "relative z-[101] w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/10",
          "dark:border dark:border-zinc-700/80 dark:bg-zinc-900",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">
          {showUrgencyBadge ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
              <span aria-hidden>✨</span>
              Slots filling fast
            </span>
          ) : null}
        </div>

        <h2
          id="exit-intent-title"
          className="text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Almost done 🎉
        </h2>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {lockedBooking
            ? "Your cleaner is still available at this time. Complete your booking now before the slot is taken."
            : "You’re so close. Finish your booking to hold your service — popular times go quickly."}
        </p>

        {lockedBooking && lockedSummaryOneLine && lockedPriceZar != null ? (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            <p className="leading-snug">{lockedSummaryOneLine}</p>
            <p className="mt-1.5 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
              R {lockedPriceZar.toLocaleString("en-ZA")}
            </p>
          </div>
        ) : !lockedBooking && (svcLabel != null || estimateZar != null) ? (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            {svcLabel ? <p className="leading-snug">{svcLabel}</p> : null}
            {estimateZar != null ? (
              <p className="mt-1.5 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                From R {Math.round(estimateZar).toLocaleString("en-ZA")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Pick a time on the next step to lock this in.</p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>✔ No payment yet</span>
          <span>✔ Free reschedule</span>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
          >
            Continue later
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={() => {
              onCompleteBooking();
              onOpenChange(false);
            }}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
          >
            Complete booking →
          </button>
        </div>
      </div>
    </div>
  );
}
