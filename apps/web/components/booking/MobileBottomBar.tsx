"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StickyPlanPriceBreakdown } from "@/components/booking/StickyPriceBar";

export type MobileCheckoutDockActions = {
  onBack: () => void;
  backDisabled?: boolean;
  backLabel?: string;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  /** No Continue button (e.g. details step before home is chosen). */
  hideContinue?: boolean;
};

export type MobileBottomBarProps = {
  /** Primary line when set (e.g. `6.3 hrs`); shown under “Estimated”. */
  estimatedHoursLabel?: string | null;
  totalCaption?: string | null | undefined;
  totalDisplay: string;
  /** Numeric total for compare-from strikethrough (optional). */
  totalZar?: number;
  compareFromZar?: number | null;
  amountDisplayOverride?: string | null;
  planPriceBreakdown?: StickyPlanPriceBreakdown | null;
  subline?: string | null;
  ctaLabel?: string;
  ctaUrgency?: string;
  onCta?: () => void;
  disabled?: boolean;
  loading?: boolean;
  onAmountClick?: () => void;
  /** Used only when `omitCta` (checkout strip). */
  ctaStartSlot?: ReactNode;
  /** `flat` / `elevated` kept for checkout strip (`omitCta`). */
  variant?: "flat" | "elevated";
  /** Price / hours only (checkout shell stacks CTA below). */
  omitCta?: boolean;
  /** Checkout: one row — subtle Back | quote (tap) | Continue (replaces separate `BottomCTA`). */
  checkoutDock?: MobileCheckoutDockActions;
  /** Label when hours are unknown (small top line in horizontal footer). */
  totalSectionLabel?: string;
  /** Subtle text back (booking horizontal footer); keep low visual weight vs CTA. */
  onMobileBack?: () => void;
  mobileBackLabel?: string;
  /** Omit ZAR / plan price in center (hours or caption only) — mobile sticky payment. */
  hideMobilePrice?: boolean;
};

export function MobileBottomBar({
  estimatedHoursLabel,
  totalCaption,
  totalDisplay,
  totalZar,
  compareFromZar = null,
  amountDisplayOverride = null,
  planPriceBreakdown = null,
  subline,
  ctaLabel = "Continue",
  ctaUrgency,
  onCta = () => {},
  disabled = false,
  loading = false,
  onAmountClick,
  ctaStartSlot,
  variant = "flat",
  omitCta = false,
  checkoutDock,
  totalSectionLabel = "Total",
  onMobileBack,
  mobileBackLabel = "Back",
  hideMobilePrice = false,
}: MobileBottomBarProps) {
  const amountLine = amountDisplayOverride ?? totalDisplay;
  const compareBaseZar = typeof totalZar === "number" && Number.isFinite(totalZar) ? totalZar : null;
  const showCompareFrom =
    compareFromZar != null &&
    Number.isFinite(compareFromZar) &&
    compareBaseZar != null &&
    compareFromZar > compareBaseZar &&
    !amountDisplayOverride &&
    !planPriceBreakdown;

  const hoursValue = estimatedHoursLabel?.trim() ? estimatedHoursLabel : "—";

  /** Checkout shell: compact single row + optional start slot. */
  if (omitCta) {
    const priceStack =
      planPriceBreakdown && !amountDisplayOverride ? (
        <div className="min-w-0">
          <div className="flex max-w-full flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            {estimatedHoursLabel ? (
              <>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {estimatedHoursLabel}
                </span>
                <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
                  ·
                </span>
              </>
            ) : null}
            <p className="min-w-0 truncate text-xs tabular-nums text-zinc-500 line-through dark:text-zinc-500">
              R {planPriceBreakdown.baseZar.toLocaleString("en-ZA")}
            </p>
            <p className="min-w-0 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              R {planPriceBreakdown.discountedZar.toLocaleString("en-ZA")}{" "}
              <span className="text-[10px] font-medium text-emerald-800 dark:text-emerald-300/90">
                with {planPriceBreakdown.planLabel}
              </span>
            </p>
          </div>
          {subline ? <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p> : null}
        </div>
      ) : (
        <div className="min-w-0">
          {estimatedHoursLabel ? (
            <div className="flex max-w-full flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {estimatedHoursLabel}
              </span>
              <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
                ·
              </span>
              <div className="flex min-w-0 flex-col gap-0">
                {showCompareFrom ? (
                  <p className="text-xs tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                    R {compareFromZar!.toLocaleString("en-ZA")}
                  </p>
                ) : null}
                <p className="text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-400">{amountLine}</p>
              </div>
            </div>
          ) : (
            <>
              {totalCaption ? (
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {totalCaption}
                </p>
              ) : null}
              {showCompareFrom ? (
                <p className="text-xs tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                  R {compareFromZar!.toLocaleString("en-ZA")}
                </p>
              ) : null}
              <p className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{amountLine}</p>
            </>
          )}
          {!planPriceBreakdown || amountDisplayOverride ? (
            subline ? <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subline}</p> : null
          ) : null}
        </div>
      );

    const leftBlock = onAmountClick ? (
      <button
        type="button"
        onClick={onAmountClick}
        className="min-w-0 flex-1 py-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="View booking summary"
      >
        {priceStack}
      </button>
    ) : (
      <div className="min-w-0 flex-1">{priceStack}</div>
    );

    const centerPriceTap = onAmountClick ? (
      <button
        type="button"
        onClick={onAmountClick}
        className="flex min-w-0 flex-1 items-center justify-center px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="View booking summary"
      >
        {priceStack}
      </button>
    ) : (
      <div className="flex min-w-0 flex-1 items-center justify-center px-1">{priceStack}</div>
    );

    const inner = checkoutDock ? (
      <div className="flex w-full items-center gap-1.5">
        <button
          type="button"
          onClick={checkoutDock.onBack}
          disabled={checkoutDock.backDisabled}
          className="-mx-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md px-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {checkoutDock.backLabel ?? "Back"}
        </button>
        {centerPriceTap}
        {checkoutDock.hideContinue ? (
          <span className="w-[5.25rem] shrink-0 sm:w-24" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={checkoutDock.onContinue}
            disabled={checkoutDock.continueDisabled}
            className={cn(
              "flex min-h-[44px] shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform duration-150 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
              "active:scale-[0.97] motion-reduce:active:scale-100",
              checkoutDock.continueDisabled
                ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                : "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500",
            )}
          >
            {checkoutDock.continueLabel ?? "Continue"}
          </button>
        )}
      </div>
    ) : (
      <div className="flex w-full items-center justify-between gap-3">
        {leftBlock}
        {ctaStartSlot ? <div className="flex shrink-0 items-center gap-2">{ctaStartSlot}</div> : null}
      </div>
    );

    const omitShellPad = checkoutDock
      ? "px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      : "px-4 py-3";

    if (variant === "elevated") {
      return (
        <div className="rounded-t-2xl border border-b-0 border-zinc-200/90 bg-white/98 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/40">
          <div className={omitShellPad}>{inner}</div>
        </div>
      );
    }

    return <div className={cn("w-full", omitShellPad)}>{inner}</div>;
  }

  /** Main booking flow: single row — subtle Back | centered hours + price (inline on mobile) | dominant Continue. */
  const hasHours = Boolean(estimatedHoursLabel?.trim());
  const captionWhenNoHours = (totalSectionLabel ?? totalCaption ?? "").trim() || "—";

  /** Hours + amount on one horizontal row (this bar is mobile-only in booking layout). */
  const centerStack = hideMobilePrice ? (
    hasHours ? (
      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{hoursValue}</span>
    ) : (
      <span className="max-w-[10rem] truncate text-center text-xs text-zinc-500 dark:text-zinc-400">
        {captionWhenNoHours}
      </span>
    )
  ) : planPriceBreakdown && !amountDisplayOverride ? (
      <div className="flex min-w-0 max-w-full flex-row flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center">
        {hasHours ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{hoursValue}</span>
        ) : null}
        {hasHours ? (
          <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
        ) : null}
        <span className="min-w-0 text-[10px] tabular-nums text-zinc-400 line-through dark:text-zinc-500">
          R {planPriceBreakdown.baseZar.toLocaleString("en-ZA")}
        </span>
        <span className="min-w-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          R {planPriceBreakdown.discountedZar.toLocaleString("en-ZA")}
          <span className="ml-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300/90">
            ({planPriceBreakdown.planLabel})
          </span>
        </span>
      </div>
    ) : hasHours ? (
      <div className="flex min-w-0 max-w-full flex-row flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{hoursValue}</span>
        <span className="shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden>
          ·
        </span>
        <div className="flex min-w-0 flex-col items-center gap-0">
          {showCompareFrom ? (
            <span className="text-[10px] leading-none tabular-nums text-zinc-400 line-through dark:text-zinc-500">
              R {compareFromZar!.toLocaleString("en-ZA")}
            </span>
          ) : null}
          <span className="text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-400">{amountLine}</span>
        </div>
      </div>
    ) : (
      <div className="flex max-w-[min(100%,11rem)] flex-col items-center gap-0.5 text-center">
        <span className="text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">{captionWhenNoHours}</span>
        {showCompareFrom ? (
          <span className="text-[10px] leading-none tabular-nums text-zinc-400 line-through dark:text-zinc-500">
            R {compareFromZar!.toLocaleString("en-ZA")}
          </span>
        ) : null}
        <span className="text-sm font-semibold tabular-nums leading-tight text-zinc-900 dark:text-zinc-50">{amountLine}</span>
      </div>
    );

  const centerSlot =
    onAmountClick != null && !hideMobilePrice ? (
      <button
        type="button"
        onClick={onAmountClick}
        className="flex min-w-0 flex-1 flex-row items-center justify-center px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="View booking summary"
      >
        {centerStack}
      </button>
    ) : (
      <div className="flex min-w-0 flex-1 flex-row items-center justify-center px-1">{centerStack}</div>
    );

  return (
    <div className="w-full bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-zinc-950">
      {ctaUrgency ? (
        <p className="mb-1.5 truncate text-center text-[10px] font-semibold leading-tight text-amber-800 dark:text-amber-300/90">
          {ctaUrgency}
        </p>
      ) : subline ? (
        <p className="mb-1.5 truncate text-center text-[10px] text-zinc-500 dark:text-zinc-400">{subline}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {onMobileBack ? (
          <button
            type="button"
            onClick={onMobileBack}
            className="-mx-1 shrink-0 rounded-md px-2 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {mobileBackLabel}
          </button>
        ) : (
          <span className="w-10 shrink-0" aria-hidden />
        )}

        {centerSlot}

        <button
          type="button"
          onClick={onCta}
          disabled={disabled || loading}
          className={cn(
            "flex min-h-[44px] shrink-0 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform duration-150 ease-out",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
            "active:scale-[0.97] motion-reduce:active:scale-100",
            disabled || loading
              ? "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
              : "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500",
          )}
        >
          {loading ? "Wait…" : ctaLabel}
        </button>
      </div>
    </div>
  );
}
