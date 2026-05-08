"use client";

import { Calendar, MapPin, Sparkles, UserRound, Users } from "lucide-react";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const copy = bookingCopy.checkoutPayment;

function formatHoursForTotal(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  const x = Math.round(h * 10) / 10;
  const s = Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, "");
  return `${s} hrs`;
}

type PaymentCheckoutReviewProps = {
  whatLabel: string;
  summaryHours: number;
  scheduleLine: string;
  whereLabel: string;
  cleanerLabel: string;
  extrasLine: string;
  summaryTotalZar: number;
  loading?: boolean;
  className?: string;
};

export function PaymentCheckoutReview({
  whatLabel,
  summaryHours,
  scheduleLine,
  whereLabel,
  cleanerLabel,
  extrasLine,
  summaryTotalZar,
  loading,
  className,
}: PaymentCheckoutReviewProps) {
  const hoursStr = formatHoursForTotal(summaryHours);
  const priceStr =
    loading || !Number.isFinite(summaryTotalZar)
      ? "…"
      : `R${Math.round(summaryTotalZar).toLocaleString("en-ZA")}`;
  const totalEmphasis =
    loading || !Number.isFinite(summaryTotalZar) ? "…" : `${priceStr} for ${hoursStr}`;

  const rowIcon = "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  const labelMuted = "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

  return (
    <div className={cn("space-y-1", className)}>
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.reviewCardTitle}</h2>

      <div className="mt-4 space-y-0 divide-y divide-zinc-100 rounded-xl border border-zinc-200/90 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-3 py-3.5 sm:px-4">
          <div className={rowIcon} aria-hidden>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={labelMuted}>Service</p>
            <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{whatLabel}</p>
          </div>
          <span className="shrink-0 pt-7 text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
            {loading ? "…" : hoursStr}
          </span>
        </div>

        <div className="flex items-start gap-3 px-3 py-3.5 sm:px-4">
          <div className={rowIcon} aria-hidden>
            <Calendar className="h-4 w-4" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={labelMuted}>Schedule</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{scheduleLine}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 px-3 py-3.5 sm:px-4">
          <div className={rowIcon} aria-hidden>
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={labelMuted}>Location</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{whereLabel}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 px-3 py-3.5 sm:px-4">
          <div className={rowIcon} aria-hidden>
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={labelMuted}>Cleaner</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{cleanerLabel}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 px-3 py-3.5 sm:px-4">
          <div className={rowIcon} aria-hidden>
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={labelMuted}>Extras</p>
            <p className="mt-1 text-sm font-medium leading-snug text-zinc-800 dark:text-zinc-200">{extrasLine}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-4 sm:px-4">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Total</span>
          <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{totalEmphasis}</span>
        </div>
      </div>
    </div>
  );
}
