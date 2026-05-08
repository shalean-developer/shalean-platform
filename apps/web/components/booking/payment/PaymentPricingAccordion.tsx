"use client";

import { ChevronDown } from "lucide-react";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

type Props = {
  summary: BookingPaymentSummary;
  className?: string;
};

export function PaymentPricingAccordion({ summary, className }: Props) {
  const core = summary.bookingCoreZar;
  const fee = summary.serviceFeeZar;
  const extras = summary.extrasTotalZar;
  const showLines =
    (typeof core === "number" && Number.isFinite(core) && core > 0) ||
    (typeof fee === "number" && Number.isFinite(fee) && fee > 0) ||
    extras > 0;

  if (!showLines) return null;

  return (
    <details
      className={cn(
        "group rounded-xl border border-zinc-200/70 bg-zinc-50/40 dark:border-zinc-700/80 dark:bg-zinc-900/25",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-400 [&::-webkit-details-marker]:hidden">
        <span>View detailed pricing</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 dark:text-zinc-400" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-zinc-100 px-3 pb-3 pt-2 text-sm dark:border-zinc-800/80">
        {typeof core === "number" && Number.isFinite(core) && core > 0 ? (
          <div className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span>Visit</span>
            <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">{fmt(core)}</span>
          </div>
        ) : null}
        {extras > 0 ? (
          <div className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span>Add-ons</span>
            <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">{fmt(extras)}</span>
          </div>
        ) : null}
        {typeof fee === "number" && Number.isFinite(fee) && fee > 0 ? (
          <div className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span>Service fee</span>
            <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">{fmt(fee)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-zinc-100 pt-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
          <span>Total due</span>
          <span className="tabular-nums">{fmt(summary.priceZar)}</span>
        </div>
      </div>
    </details>
  );
}
