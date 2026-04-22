"use client";

import type { ReactNode } from "react";
import BookingContainer from "@/components/layout/BookingContainer";
import { BookingHeader } from "@/components/booking/BookingHeader";
import BookingSummary from "./BookingSummary";
import { StickyPriceBar } from "@/components/booking/StickyPriceBar";
import { bookingCopy } from "@/lib/booking/copy";
import type { BookingStep1State } from "./useBookingStep1";

type BookingLayoutProps = {
  children: ReactNode;
  /** Live selections for the summary sidebar; omit on steps without step-1 data yet */
  summaryState?: BookingStep1State;
  /** When set, replaces default `BookingSummary` (desktop + mobile). */
  summaryOverride?: ReactNode;
  /** Step 2: never show locked slot totals in the sidebar — estimate from live selections only. */
  summaryIgnoreLockedBooking?: boolean;
  /** Step 4: hide sidebar totals until a slot is locked — show “select a time” instead. */
  suppressEstimateUntilLocked?: boolean;
  /** Checkout: amount due (after discounts); sidebar matches footer when set. */
  summaryAmountToPayZar?: number;
  canContinue?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
  /** Shows a loading state on the primary action (e.g. Paystack redirect). */
  continueLoading?: boolean;
  /** When false, hides the trailing arrow on the footer CTA. */
  showContinueArrow?: boolean;
  /** Primary blue Pay CTA (full-width, large). */
  continueVariant?: "default" | "pay";
  /** Small trust / helper lines under the footer button. */
  footerSubcopy?: ReactNode;
  /** Renders above the footer CTA row (e.g. speed hint at checkout). */
  footerPreCta?: ReactNode;
  /** Checkout: total on the left, pay button on the right (fixed bar). */
  footerSplit?: boolean;
  /** ZAR total shown next to “Total” when `footerSplit` is true. */
  footerTotalZar?: number;
  /** Renders above main content (e.g. multi-step progress). */
  progressSlot?: ReactNode;
  /** Mobile-first fixed bottom bar (split total + CTA). Desktop keeps standard footer. */
  stickyMobileBar?: {
    totalZar: number;
    /** Replaces the currency line when no numeric total should appear yet. */
    amountDisplayOverride?: string | null;
    subline?: string;
    /** Label above amount on mobile sticky (defaults to copy pack). */
    totalCaption?: string;
    /** Short CTA on mobile sticky (defaults to copy pack). */
    ctaShort?: string;
    /** One line above sticky CTA (urgency / availability). */
    ctaUrgency?: string;
  };
  /** Desktop: summary column first (checkout trust layout). */
  summaryColumnFirst?: boolean;
};

export default function BookingLayout({
  children,
  summaryState,
  summaryOverride,
  summaryIgnoreLockedBooking = false,
  suppressEstimateUntilLocked = false,
  summaryAmountToPayZar,
  canContinue = false,
  onContinue,
  continueLabel = "Continue",
  continueLoading = false,
  showContinueArrow = true,
  continueVariant = "default",
  footerSubcopy,
  footerPreCta,
  footerSplit = false,
  footerTotalZar,
  progressSlot,
  stickyMobileBar,
  summaryColumnFirst = false,
}: BookingLayoutProps) {
  const showSummary = summaryOverride != null || summaryState != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <BookingHeader />

      <main
        className={[
          "flex-1 py-0",
          footerSplit || stickyMobileBar ? "pb-32 sm:pb-28" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          {progressSlot ? <div className="mb-2 max-w-lg lg:max-w-none">{progressSlot}</div> : null}
          {showSummary ? (
            <div className="mb-8 lg:hidden">
              {summaryOverride ? (
                summaryOverride
              ) : summaryState ? (
                <BookingSummary
                  state={summaryState}
                  ignoreLockedBooking={summaryIgnoreLockedBooking}
                  suppressEstimateUntilLocked={suppressEstimateUntilLocked}
                  amountToPayZar={summaryAmountToPayZar}
                />
              ) : null}
            </div>
          ) : null}

          <div
            className={
              showSummary
                ? summaryColumnFirst
                  ? "grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]"
                  : "grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]"
                : "grid grid-cols-1 gap-8"
            }
          >
            {showSummary && summaryColumnFirst ? (
              <aside
                className={[
                  "sticky order-first hidden h-fit min-w-0 lg:order-none lg:block",
                  "top-28",
                ].join(" ")}
              >
                {summaryOverride ? (
                  summaryOverride
                ) : summaryState ? (
                  <BookingSummary
                    state={summaryState}
                    ignoreLockedBooking={summaryIgnoreLockedBooking}
                    suppressEstimateUntilLocked={suppressEstimateUntilLocked}
                    amountToPayZar={summaryAmountToPayZar}
                  />
                ) : null}
              </aside>
            ) : null}

            <div className="min-w-0">
              <BookingContainer>{children}</BookingContainer>
            </div>

            {showSummary && !summaryColumnFirst ? (
              <aside
                className={[
                  "sticky hidden h-fit min-w-0 lg:block",
                  "top-28",
                ].join(" ")}
              >
                {summaryOverride ? (
                  summaryOverride
                ) : summaryState ? (
                  <BookingSummary
                    state={summaryState}
                    ignoreLockedBooking={summaryIgnoreLockedBooking}
                    suppressEstimateUntilLocked={suppressEstimateUntilLocked}
                    amountToPayZar={summaryAmountToPayZar}
                  />
                ) : null}
              </aside>
            ) : null}
          </div>
        </div>
      </main>

      <footer
        className={[
          "z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95",
          footerSplit || stickyMobileBar
            ? "fixed bottom-0 left-0 right-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
            : "sticky bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
        ].join(" ")}
      >
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          {footerPreCta ? (
            <div className="mb-2 text-center text-[11px] text-zinc-600 dark:text-zinc-400">{footerPreCta}</div>
          ) : null}

          {stickyMobileBar ? (
            <div className="lg:hidden">
              <StickyPriceBar
                totalZar={stickyMobileBar.totalZar}
                amountDisplayOverride={stickyMobileBar.amountDisplayOverride}
                totalCaption={stickyMobileBar.totalCaption ?? bookingCopy.stickyBar.total}
                subline={stickyMobileBar.subline}
                ctaLabel={stickyMobileBar.ctaShort ?? bookingCopy.stickyBar.cta}
                ctaUrgency={stickyMobileBar.ctaUrgency}
                onCta={() => onContinue?.()}
                disabled={!canContinue}
                loading={continueLoading}
              />
            </div>
          ) : null}

          {stickyMobileBar ? (
            <div className="hidden lg:block">
              {footerSplit || stickyMobileBar ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stickyMobileBar.totalCaption ?? bookingCopy.stickyBar.total}
                    </p>
                    <p className="truncate text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {(() => {
                        if (stickyMobileBar.amountDisplayOverride) {
                          return stickyMobileBar.amountDisplayOverride;
                        }
                        const z =
                          typeof footerTotalZar === "number"
                            ? footerTotalZar
                            : stickyMobileBar.totalZar;
                        return Number.isFinite(z) ? `R ${z.toLocaleString("en-ZA")}` : "—";
                      })()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {stickyMobileBar.ctaUrgency ? (
                      <p className="text-right text-[10px] font-semibold leading-tight text-amber-800 dark:text-amber-300/95">
                        {stickyMobileBar.ctaUrgency}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onContinue?.()}
                      disabled={!canContinue || continueLoading}
                      className={[
                        "rounded-xl px-6 py-3 text-sm font-semibold tracking-tight transition-all",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        canContinue
                          ? continueLoading
                            ? "cursor-wait bg-primary text-primary-foreground opacity-95"
                            : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-[0.99]"
                          : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
                      ].join(" ")}
                    >
                      {continueLoading ? "Redirecting…" : continueLabel}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!stickyMobileBar && footerSplit ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{bookingCopy.stickyBar.total}</p>
                <p className="truncate text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {typeof footerTotalZar === "number"
                    ? `R ${footerTotalZar.toLocaleString("en-ZA")}`
                    : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onContinue?.()}
                disabled={!canContinue || continueLoading}
                className={[
                  "shrink-0 rounded-xl px-6 py-3 text-sm font-semibold tracking-tight transition-all",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  canContinue
                    ? continueLoading
                      ? "cursor-wait bg-primary text-primary-foreground opacity-95"
                      : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-[0.99]"
                    : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
                ].join(" ")}
              >
                {continueLoading ? "Redirecting…" : continueLabel}
              </button>
            </div>
          ) : !stickyMobileBar ? (
            <button
              type="button"
              onClick={() => onContinue?.()}
              disabled={!canContinue || continueLoading}
              className={[
                "w-full rounded-xl font-semibold tracking-tight transition-all",
                continueVariant === "pay"
                  ? "min-h-14 px-4 text-base"
                  : "h-12 text-[15px]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                canContinue
                  ? continueLoading
                    ? continueVariant === "pay"
                      ? "cursor-wait bg-primary text-primary-foreground opacity-95"
                      : "cursor-wait bg-zinc-900 text-white opacity-95 dark:bg-white dark:text-zinc-950"
                    : continueVariant === "pay"
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.99] dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                      : "bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 active:scale-[0.99] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                  : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
              ].join(" ")}
            >
              {continueLoading
                ? continueVariant === "pay"
                  ? "Redirecting..."
                  : "Redirecting to Paystack…"
                : continueLabel}
              {!continueLoading && showContinueArrow ? " →" : ""}
            </button>
          ) : null}
          {footerSubcopy ? (
            <div className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">{footerSubcopy}</div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
