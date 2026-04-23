"use client";

import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

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
  /** Flat full-width bar (quote mobile): border-t, compact CTA, optional tap on amount. */
  variant?: "elevated" | "flat";
  /** When set, the price block is a button (e.g. opens summary sheet). */
  onAmountClick?: () => void;
  /** When false, caption is not forced uppercase (e.g. “From”). */
  captionUppercase?: boolean;
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
  variant = "elevated",
  onAmountClick,
  captionUppercase = true,
}: StickyPriceBarProps) {
  const amountLine = amountDisplayOverride ?? `R ${totalZar.toLocaleString("en-ZA")}`;

  const priceBlock = (
    <>
      <p
        className={cn(
          captionUppercase
            ? "text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            : "text-xs text-zinc-500 dark:text-zinc-400",
        )}
      >
        {totalCaption}
      </p>
      <p className="truncate text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{amountLine}</p>
      {subline && variant === "elevated" ? (
        <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p>
      ) : null}
    </>
  );

  const ctaButton = (
    <button
      type="button"
      onClick={onCta}
      disabled={disabled || loading}
      className={cn(
        "shrink-0 font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variant === "flat" && "h-10 rounded-lg px-4 text-sm",
        variant === "elevated" && "rounded-xl px-5 py-3 text-sm font-semibold tracking-tight",
        variant === "flat" &&
          (disabled || loading
            ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            : "bg-black text-white hover:bg-zinc-900 active:scale-[0.99] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"),
        variant === "elevated" &&
          (disabled || loading
            ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-[0.99]"),
      )}
    >
      {loading ? "Please wait…" : ctaLabel}
    </button>
  );

  if (variant === "flat") {
    return (
      <div className="flex w-full items-center justify-between gap-3 px-4 py-2.5">
        {onAmountClick ? (
          <button
            type="button"
            onClick={onAmountClick}
            className="min-w-0 flex-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="View booking summary"
          >
            {priceBlock}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{priceBlock}</div>
        )}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {ctaUrgency ? (
            <p className="max-w-[9.5rem] text-right text-[10px] font-semibold leading-tight text-amber-800 dark:text-amber-300/95">
              {ctaUrgency}
            </p>
          ) : null}
          {ctaButton}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-zinc-200/90 bg-white/98 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/40">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {totalCaption}
        </p>
        <p className="truncate text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{amountLine}</p>
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
        {ctaButton}
      </div>
    </div>
  );
}
