"use client";

import { bookingCopy } from "@/lib/booking/copy";

type StickyPriceBarProps = {
  totalZar: number;
  /** When set, replaces the formatted `R …` line (e.g. before a slot is locked). */
  amountDisplayOverride?: string | null;
  /** Shown above the amount (defaults to `bookingCopy.stickyBar.total`). */
  totalCaption?: string;
  /** Mobile sticky primary action (defaults to `bookingCopy.stickyBar.cta`). */
  ctaLabel?: string;
  /** Small urgency line above the CTA (optional). */
  ctaUrgency?: string;
  onCta: () => void;
  disabled?: boolean;
  loading?: boolean;
  subline?: string;
};

export function StickyPriceBar({
  totalZar,
  amountDisplayOverride = null,
  totalCaption = bookingCopy.stickyBar.total,
  ctaLabel = bookingCopy.stickyBar.cta,
  ctaUrgency,
  onCta,
  disabled = false,
  loading = false,
  subline,
}: StickyPriceBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-zinc-200/90 bg-white/98 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/40">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {totalCaption}
        </p>
        <p className="truncate text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {amountDisplayOverride ?? `R ${totalZar.toLocaleString("en-ZA")}`}
        </p>
        {subline ? (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {ctaUrgency ? (
          <p className="max-w-[9.5rem] text-right text-[10px] font-semibold leading-tight text-amber-800 dark:text-amber-300/95">
            {ctaUrgency}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onCta}
          disabled={disabled || loading}
          className={[
            "rounded-xl px-5 py-3 text-sm font-semibold tracking-tight transition-all",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            disabled || loading
              ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
              : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-[0.99]",
          ].join(" ")}
        >
          {loading ? "Please wait…" : ctaLabel}
        </button>
      </div>
    </div>
  );
}
