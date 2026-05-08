"use client";

import { ShieldCheck } from "lucide-react";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const copy = bookingCopy.checkoutPayment;

export function TrustReinforcementCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-emerald-100/70 bg-emerald-50/30 px-3 py-2 dark:border-emerald-900/30 dark:bg-emerald-950/20",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300/95">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
        {copy.trustSecure}
      </span>
      <span className="hidden h-3 w-px bg-emerald-200/80 dark:bg-emerald-800/80 sm:inline" aria-hidden />
      <span className="text-[11px] font-medium text-emerald-800/85 dark:text-emerald-200/85">{copy.trustNoFees}</span>
    </div>
  );
}
