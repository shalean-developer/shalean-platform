"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BookingContainer from "@/components/layout/BookingContainer";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import BookingSummary from "./BookingSummary";
import { StickyPriceBar, type StickyPlanPriceBreakdown } from "@/components/booking/StickyPriceBar";
import { BookingFooterInsightBanner, readFooterInsightDismissed } from "@/components/booking/BookingFooterInsightBanner";
import { bookingCopy } from "@/lib/booking/copy";
import type { BookingStep1State } from "./useBookingStep1";
import { cn } from "@/lib/utils";

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
  /** Step 4: “When” summary line before lock (e.g. selected weekday + date). */
  scheduleDateHint?: string | null;
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
    compareFromZar?: number | null;
    /** Replaces the currency line when no numeric total should appear yet. */
    amountDisplayOverride?: string | null;
    subline?: string;
    /** Label above amount on mobile sticky (defaults to copy pack). */
    totalCaption?: string;
    /** Short CTA on mobile sticky (defaults to copy pack). */
    ctaShort?: string;
    /** One line above sticky CTA (urgency / availability). */
    ctaUrgency?: string;
    /** Quote mobile: tap price to open a bottom sheet with the booking summary. */
    openSummarySheetOnAmountTap?: boolean;
    /** Details step: list + plan-discounted preview (UI only). */
    planPriceBreakdown?: StickyPlanPriceBreakdown | null;
  };
  /**
   * When `stickyMobileBar` is set and this is `false`, the wide desktop footer row is hidden
   * (checkout rail in page content replaces it). Mobile sticky bar is unchanged.
   */
  showStickyPriceBarDesktop?: boolean;
  /** Quote / details mobile: dismissible insight strip stacked above the sticky price bar (full width). */
  footerInsightBanner?: {
    variant: "quote" | "details";
  };
  /** Desktop: summary column first (checkout trust layout). */
  summaryColumnFirst?: boolean;
  /** When true, `summaryOverride` / sidebar summary is not shown in the mobile top block (desktop sidebar unchanged). */
  summaryDesktopOnly?: boolean;
  /** Entry step: fixed bottom CTA on small screens + extra main padding (desktop keeps sticky footer). */
  mobileEntryFooter?: boolean;
  /** Entry step: short trust line shown on the left of the footer row (e.g. social proof). */
  footerEntryLead?: ReactNode;
};

export default function BookingLayout({
  children,
  summaryState,
  summaryOverride,
  summaryIgnoreLockedBooking = false,
  suppressEstimateUntilLocked = false,
  scheduleDateHint = null,
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
  summaryDesktopOnly = false,
  mobileEntryFooter = false,
  footerEntryLead,
  footerInsightBanner,
  showStickyPriceBarDesktop = true,
}: BookingLayoutProps) {
  const router = useRouter();
  const { step, handleBack } = useBookingFlow();
  /** Start true so SSR + first client paint match; sync from sessionStorage after mount only. */
  const [footerInsightDismissed, setFooterInsightDismissed] = useState(true);

  useEffect(() => {
    if (!footerInsightBanner) {
      setFooterInsightDismissed(true);
      return;
    }
    setFooterInsightDismissed(readFooterInsightDismissed(footerInsightBanner.variant));
  }, [footerInsightBanner?.variant]);
  const onFooterBack = useCallback(() => {
    if (step === "entry") {
      router.push("/");
      return;
    }
    handleBack();
  }, [step, handleBack, router]);

  const footerBackButton = useMemo(
    () => (
      <button
        type="button"
        onClick={onFooterBack}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900",
          continueVariant === "pay" ? "min-h-14 min-w-14" : mobileEntryFooter ? "h-10 w-10 rounded-lg" : "h-12 w-12",
        )}
        aria-label={step === "entry" ? "Back to home" : "Go back"}
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
    ),
    [onFooterBack, step, continueVariant, mobileEntryFooter],
  );

  const showSummary = summaryOverride != null || summaryState != null;
  const sheetFromPrice = Boolean(stickyMobileBar?.openSummarySheetOnAmountTap && showSummary);
  const [summarySheetOpen, setSummarySheetOpen] = useState(false);

  useEffect(() => {
    if (!summarySheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSummarySheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [summarySheetOpen]);

  const hideMobilePricingFootnotes = Boolean(footerInsightBanner && !footerInsightDismissed);

  const renderSummary = (embedded?: boolean) => {
    if (summaryOverride) return summaryOverride;
    if (!summaryState) return null;
    return (
      <BookingSummary
        state={summaryState}
        scheduleDateHint={scheduleDateHint}
        ignoreLockedBooking={summaryIgnoreLockedBooking}
        suppressEstimateUntilLocked={suppressEstimateUntilLocked}
        amountToPayZar={summaryAmountToPayZar}
        embedded={Boolean(embedded)}
        hideMobilePricingFootnotes={hideMobilePricingFootnotes}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <BookingHeader />

      <main
        className={[
          "flex-1 py-0",
          footerSplit || stickyMobileBar
            ? stickyMobileBar && !showStickyPriceBarDesktop
              ? footerInsightBanner && !footerInsightDismissed
                ? "pb-44 sm:pb-40 lg:pb-8"
                : "pb-32 sm:pb-28 lg:pb-8"
              : footerInsightBanner && !footerInsightDismissed
                ? "pb-44 sm:pb-40"
                : "pb-32 sm:pb-28"
            : "",
          mobileEntryFooter && !footerSplit && !stickyMobileBar ? "max-lg:pb-36" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          {progressSlot ? <div className="mb-2 max-w-lg lg:max-w-none">{progressSlot}</div> : null}
          {showSummary && !summaryDesktopOnly ? (
            <div className="mb-8 lg:hidden">
              {renderSummary()}
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
                  "sticky order-first hidden h-fit min-w-0 self-start lg:order-none lg:block",
                  "top-24",
                ].join(" ")}
              >
                {renderSummary()}
              </aside>
            ) : null}

            <div className="min-w-0">
              <BookingContainer>{children}</BookingContainer>
            </div>

            {showSummary && !summaryColumnFirst ? (
              <aside
                className={[
                  "sticky hidden h-fit min-w-0 self-start lg:block",
                  "top-24",
                ].join(" ")}
              >
                {renderSummary()}
              </aside>
            ) : null}
          </div>
        </div>
      </main>

      <footer
        className={cn(
          "z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95",
          mobileEntryFooter &&
            !footerSplit &&
            !stickyMobileBar &&
            "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:bg-white max-lg:px-4 max-lg:py-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3 max-lg:shadow-[0_-4px_24px_rgba(0,0,0,0.06)] lg:sticky lg:bottom-0 lg:px-0 lg:py-3 lg:pb-[max(1rem,env(safe-area-inset-bottom))] lg:shadow-none",
          (footerSplit || stickyMobileBar) &&
            (stickyMobileBar && !showStickyPriceBarDesktop
              ? cn(
                  "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:border-t max-lg:border-zinc-200/80 max-lg:bg-white/95 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:backdrop-blur-md max-lg:dark:border-zinc-800 max-lg:dark:bg-zinc-950/95",
                  stickyMobileBar?.openSummarySheetOnAmountTap ? "max-lg:pt-2" : "max-lg:pt-4",
                  "lg:static lg:border-transparent lg:bg-transparent lg:pb-0 lg:pt-0 lg:shadow-none lg:backdrop-blur-none",
                )
              : cn(
                  "fixed bottom-0 left-0 right-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                  stickyMobileBar?.openSummarySheetOnAmountTap ? "max-lg:pt-2 lg:pt-4" : "pt-4",
                )),
          !footerSplit && !stickyMobileBar && !mobileEntryFooter &&
            "sticky bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
        )}
      >
        <div
          className={cn(
            "mx-auto max-w-7xl px-4 lg:px-6",
            mobileEntryFooter && !footerSplit && !stickyMobileBar && "max-lg:max-w-none max-lg:px-0",
            stickyMobileBar?.openSummarySheetOnAmountTap && "max-lg:max-w-none max-lg:px-0",
          )}
        >
          {footerPreCta ? (
            <div className="mb-1.5 text-center text-[11px] text-zinc-600 dark:text-zinc-400">{footerPreCta}</div>
          ) : null}

          {stickyMobileBar && footerInsightBanner && !footerInsightDismissed ? (
            <BookingFooterInsightBanner
              variant={footerInsightBanner.variant}
              onDismiss={() => setFooterInsightDismissed(true)}
            />
          ) : null}

          {stickyMobileBar ? (
            <div className="lg:hidden">
              <StickyPriceBar
                totalZar={stickyMobileBar.totalZar}
                compareFromZar={stickyMobileBar.compareFromZar ?? null}
                amountDisplayOverride={stickyMobileBar.amountDisplayOverride}
                planPriceBreakdown={stickyMobileBar.planPriceBreakdown ?? null}
                totalCaption={stickyMobileBar.totalCaption ?? bookingCopy.stickyBar.total}
                subline={stickyMobileBar.subline}
                ctaLabel={stickyMobileBar.ctaShort ?? bookingCopy.stickyBar.cta}
                ctaUrgency={stickyMobileBar.ctaUrgency}
                onCta={() => onContinue?.()}
                disabled={!canContinue}
                loading={continueLoading}
                variant={stickyMobileBar.openSummarySheetOnAmountTap ? "flat" : "elevated"}
                onAmountClick={
                  stickyMobileBar.openSummarySheetOnAmountTap ? () => setSummarySheetOpen(true) : undefined
                }
                captionUppercase={!stickyMobileBar.openSummarySheetOnAmountTap}
                ctaStartSlot={footerBackButton}
              />
            </div>
          ) : null}

          {stickyMobileBar && showStickyPriceBarDesktop ? (
            <div className="hidden lg:block">
              {footerSplit || stickyMobileBar ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stickyMobileBar.totalCaption ?? bookingCopy.stickyBar.total}
                    </p>
                    {stickyMobileBar.planPriceBreakdown && !stickyMobileBar.amountDisplayOverride ? (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
                          R {stickyMobileBar.planPriceBreakdown.baseZar.toLocaleString("en-ZA")}{" "}
                          <span className="font-normal text-zinc-500 dark:text-zinc-500">per visit</span>
                        </p>
                        <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          R {stickyMobileBar.planPriceBreakdown.discountedZar.toLocaleString("en-ZA")}{" "}
                          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300/95">
                            with {stickyMobileBar.planPriceBreakdown.planLabel}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        {stickyMobileBar.compareFromZar != null &&
                        Number.isFinite(stickyMobileBar.compareFromZar) &&
                        stickyMobileBar.compareFromZar > stickyMobileBar.totalZar &&
                        !stickyMobileBar.amountDisplayOverride ? (
                          <p className="truncate text-xs tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                            R {stickyMobileBar.compareFromZar.toLocaleString("en-ZA")}
                          </p>
                        ) : null}
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
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {footerBackButton}
                    <div className="flex flex-col items-end gap-1">
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
              <div className="flex shrink-0 items-center gap-2">
                {footerBackButton}
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
            </div>
          ) : !stickyMobileBar ? (
            <div
              className={cn(
                "flex w-full gap-2 sm:gap-3",
                mobileEntryFooter && footerEntryLead ? "items-center" : "items-stretch",
              )}
            >
              {mobileEntryFooter && footerEntryLead ? (
                <p className="line-clamp-2 min-w-0 flex-1 text-left text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400 sm:text-xs">
                  {footerEntryLead}
                </p>
              ) : null}
              {footerBackButton}
              <button
                type="button"
                onClick={() => onContinue?.()}
                disabled={!canContinue || continueLoading}
                className={[
                  mobileEntryFooter && footerEntryLead
                    ? "shrink-0 whitespace-nowrap px-3.5 font-semibold tracking-tight transition-all sm:px-4"
                    : "min-w-0 flex-1 font-semibold tracking-tight transition-all",
                  continueVariant === "pay"
                    ? "min-h-14 rounded-xl px-4 text-base"
                    : mobileEntryFooter
                      ? cn(
                          "h-10 rounded-lg text-sm",
                          footerEntryLead ? "" : "px-4",
                        )
                      : "h-12 rounded-xl text-[15px]",
                  mobileEntryFooter
                    ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    : "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  canContinue
                    ? continueLoading
                      ? continueVariant === "pay"
                        ? "cursor-wait bg-primary text-primary-foreground opacity-95"
                        : mobileEntryFooter
                          ? "cursor-wait bg-blue-600 text-white opacity-90 dark:bg-blue-600"
                          : "cursor-wait bg-zinc-900 text-white opacity-95 dark:bg-white dark:text-zinc-950"
                      : continueVariant === "pay"
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.99] dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                        : mobileEntryFooter
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 active:scale-[0.99] dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
                          : "bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 active:scale-[0.99] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                    : mobileEntryFooter
                      ? "cursor-not-allowed rounded-lg bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
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
            </div>
          ) : null}
          {footerSubcopy && !stickyMobileBar?.openSummarySheetOnAmountTap ? (
            <div className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">{footerSubcopy}</div>
          ) : null}
        </div>
      </footer>

      {summarySheetOpen && sheetFromPrice ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close summary"
            onClick={() => setSummarySheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Booking summary"
            className="absolute inset-x-0 bottom-0 max-h-[min(80vh,560px)] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
            {renderSummary(true)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
