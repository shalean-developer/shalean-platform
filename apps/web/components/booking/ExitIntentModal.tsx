"use client";

import { bookingCopy } from "@/lib/booking/copy";
import type { BookingFlowStep } from "@/lib/booking/bookingFlow";

type ExitIntentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Primary action — e.g. scroll to pay or stay on page. */
  onCompleteBooking: () => void;
  /** Drives contextual title/offer when set. */
  currentStep?: BookingFlowStep | null;
};

function exitIntentContent(step: BookingFlowStep | null | undefined): { title: string; offer: string } {
  const fallback = bookingCopy.exitIntent;
  const by = bookingCopy.exitIntentByStep;
  if (step === "quote") return { title: by.quote.title, offer: by.quote.offer };
  if (step === "when") return { title: by.when.title, offer: by.when.offer };
  if (step === "checkout") return { title: by.checkout.title, offer: by.checkout.offer };
  return { title: fallback.title, offer: fallback.offer };
}

export function ExitIntentModal({
  open,
  onOpenChange,
  onCompleteBooking,
  currentStep = null,
}: ExitIntentModalProps) {
  if (!open) return null;

  const c = exitIntentContent(currentStep ?? undefined);
  const actions = bookingCopy.exitIntent;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-[101] w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2
          id="exit-intent-title"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {c.title}
        </h2>
        <p className="mt-3 text-sm font-medium text-primary">{c.offer}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="order-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:order-1"
          >
            {actions.dismiss}
          </button>
          <button
            type="button"
            onClick={() => {
              onCompleteBooking();
              onOpenChange(false);
            }}
            className="order-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:bg-primary/90 sm:order-2"
          >
            {actions.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
