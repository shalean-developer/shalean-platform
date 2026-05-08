"use client";

import { Lock } from "lucide-react";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const copy = bookingCopy.checkoutPayment;

export function PaymentMethodDisplay({
  className,
  footerTrust = true,
}: {
  className?: string;
  /** When false, hide the lock line (use when trust is shown in a dedicated strip above). */
  footerTrust?: boolean;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{copy.paymentMethodTitle}</h3>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#011b33] text-xs font-bold tracking-tight text-white">
            PS
          </span>
          <span className="truncate text-sm font-semibold text-[#011b33] dark:text-blue-100">{copy.paystackWordmark}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#1a1f71] dark:border-zinc-600 dark:bg-zinc-950 dark:text-blue-200">
            VISA
          </span>
          <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#eb001b] dark:border-zinc-600 dark:bg-zinc-950 dark:text-red-300">
            MC
          </span>
        </div>
      </div>
      {footerTrust ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400/95">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {copy.secureBelowCta}
        </p>
      ) : null}
    </div>
  );
}
