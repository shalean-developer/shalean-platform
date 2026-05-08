"use client";

import type { UnifiedPaymentMode } from "@/lib/booking/useUnifiedPaymentFlow";

export function RetryPaymentNotice({ paymentMode }: { paymentMode: UnifiedPaymentMode }) {
  if (paymentMode === "funnel") {
    return (
      <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 dark:border-emerald-800/50 dark:bg-emerald-950/25">
        <p className="text-[13px] font-semibold leading-snug text-emerald-900 dark:text-emerald-100">Almost there</p>
        <p className="mt-0.5 text-[12px] leading-snug text-emerald-800/90 dark:text-emerald-200/85">
          Complete secure payment to confirm your booking.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200/75 bg-amber-50/60 px-3 py-2 dark:border-amber-800/55 dark:bg-amber-950/30">
      <p className="text-[13px] font-semibold leading-snug text-amber-950 dark:text-amber-50">Payment required</p>
      <p className="mt-0.5 text-[12px] leading-snug text-amber-900/90 dark:text-amber-100/85">
        Complete payment below. Already paid? Refresh shortly or check your email.
      </p>
    </div>
  );
}
