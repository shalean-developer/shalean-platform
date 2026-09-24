"use client";

import { Suspense } from "react";
import { useFormContext } from "react-hook-form";
import styles from "./BookingV2Shell.module.css";
import { Button } from "@/components/ui/button";
import { BookingV2Provider, useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { BookingV2Header } from "@/src/features/booking-v2/components/BookingV2Header";
import { BookingV2SummaryPanel } from "@/src/features/booking-v2/components/BookingV2SummaryPanel";
import { Step1Details } from "@/src/features/booking-v2/steps/Step1Details";
import { Step2Schedule } from "@/src/features/booking-v2/steps/Step2Schedule";
import { Step3Review } from "@/src/features/booking-v2/steps/Step3Review";
import { Step4Payment } from "@/src/features/booking-v2/steps/Step4Payment";
import { PromotionBookingBanner } from "@/components/promotions/PromotionBookingBanner";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { useBookingV2FunnelTelemetry } from "@/src/features/booking-v2/hooks/useBookingV2FunnelTelemetry";
import { useBookingV2Pricing } from "@/src/features/booking-v2/hooks/useBookingV2Pricing";
import { useClientMounted } from "@/src/features/booking-v2/hooks/useClientMounted";
import { cn } from "@/lib/utils";
import { shouldShowBookingShellNavigation } from "@/lib/booking-v2/bookingShellNavigation";
import {
  BOOKING_PRICING_LOADING_MESSAGE,
  BOOKING_PRICING_UNAVAILABLE_MESSAGE,
  canEnterBookingPayment,
  type BookingPricingAvailability,
} from "@/lib/booking-v2/bookingPricingAvailability";

function BookingV2LoadingShell() {
  return (
    <div className="min-h-dvh bg-muted/35 text-foreground" aria-busy="true" aria-label="Loading booking form">
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-[var(--ui-container-wide)] items-center justify-between gap-3 px-[var(--ui-page-gutter)] py-3">
          <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
          <div className="mx-auto hidden h-8 max-w-sm flex-1 animate-pulse rounded-full bg-muted sm:block" />
          <div className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1280px] px-[var(--ui-page-gutter)] py-4 sm:py-8 lg:py-12">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start lg:gap-12 xl:gap-48">
          <div className="rounded-[var(--ui-radius-xl)] border border-border bg-card p-4 shadow-[var(--ui-shadow-sm)] sm:p-6 md:p-8 lg:translate-x-6 xl:translate-x-20">
            <div className="animate-pulse space-y-6">
              <div className="mx-auto h-7 w-40 rounded bg-muted" />
              <div className="mx-auto h-4 w-72 max-w-full rounded bg-muted" />
              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl bg-muted" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl bg-muted" />
                ))}
              </div>
              <div className="h-10 rounded-xl bg-muted" />
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="h-72 animate-pulse rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-sm)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingBlockedNotice({ availability }: { availability: BookingPricingAvailability }) {
  const loading = availability === "loading";
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--ui-radius-xl)] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-[var(--ui-shadow-sm)] sm:p-6"
    >
      <h2 className="text-lg font-bold">
        {loading ? "Loading live pricing" : "Live pricing is temporarily unavailable"}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {loading ? BOOKING_PRICING_LOADING_MESSAGE : BOOKING_PRICING_UNAVAILABLE_MESSAGE}
      </p>
    </div>
  );
}

function BookingV2Inner() {
  const mounted = useClientMounted();
  const {
    currentStep,
    goToStep,
    goNext,
    goBack,
    serviceSlug,
    pricingAvailability,
    paymentEditResetting,
    paymentEditResetError,
  } = useBookingV2();
  const { watch } = useFormContext<BookingV2FormData>();
  const reviewTime = watch("time")?.trim() ?? "";
  const pendingBookingId = watch("pendingBookingId")?.trim() ?? "";
  useBookingV2Pricing();
  useBookingV2FunnelTelemetry(currentStep, serviceSlug);

  if (!mounted) {
    return <BookingV2LoadingShell />;
  }

  const hasPendingBooking = Boolean(pendingBookingId);
  const paymentEntryAllowed = canEnterBookingPayment(pricingAvailability, hasPendingBooking);
  const stepContent =
    currentStep === 4 && !paymentEntryAllowed
      ? <PricingBlockedNotice availability={pricingAvailability} />
      : ({
          1: <Step1Details />,
          2: <Step2Schedule />,
          3: <Step3Review />,
          4: <Step4Payment />,
        }[currentStep]);

  // Keep the booking summary available throughout the full four-step journey.
  const showSidebarSummary = true;
  /** Steps 2–4 already use their own section cards — avoid duplicate outer card chrome. */
  const useOuterStepCard = currentStep === 1;
  const reviewTimeMissing = currentStep === 3 && !reviewTime;
  const showShellNavigation = shouldShowBookingShellNavigation(currentStep, serviceSlug);
  const paymentBlockMessage =
    pricingAvailability === "loading"
      ? BOOKING_PRICING_LOADING_MESSAGE
      : BOOKING_PRICING_UNAVAILABLE_MESSAGE;

  return (
    <div className="min-h-dvh bg-muted/35 text-foreground">
      <BookingV2Header serviceSlug={serviceSlug} currentStep={currentStep} onStepClick={goToStep} />

      {/* Main content — single document scroll; fluid padding for ≤390px */}
      <div className="mx-auto w-full max-w-[1280px] px-[var(--ui-page-gutter)] py-4 sm:py-8 lg:py-12">
        <div
          className={
            showSidebarSummary
              ? "grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start lg:gap-12 xl:gap-48"
              : "mx-auto max-w-[var(--ui-container-sm)]"
          }
        >
          <div
            className={cn(
              "min-w-0 w-full justify-self-center",
              showSidebarSummary ? "lg:translate-x-6 xl:translate-x-20" : "mx-auto",
              currentStep === 2
                ? "max-w-[720px]"
                : currentStep === 3 || currentStep === 4
                  ? "max-w-[760px]"
                  : "max-w-[560px]",
            )}
          >
            {showSidebarSummary && (
              <div className="mb-4 sm:mb-6 lg:hidden">
                <BookingV2SummaryPanel collapsed />
              </div>
            )}

            {paymentEditResetting ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mb-6"
              >
                Releasing the previous payment session so your booking can be repriced safely…
              </div>
            ) : paymentEditResetError ? (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mb-6"
              >
                {paymentEditResetError}
              </div>
            ) : null}

            <div
              data-review-time-missing={reviewTimeMissing ? "true" : undefined}
              className={
                useOuterStepCard
                  ? `rounded-[var(--ui-radius-xl)] border border-border bg-card p-4 text-card-foreground shadow-[var(--ui-shadow-sm)] sm:p-6 md:p-8 ${styles.step1}`
                  : `min-w-0 ${currentStep === 2 ? styles.step2 : currentStep === 3 ? styles.step3 : currentStep === 4 ? styles.step4 : ""}`
              }
            >
              <PromotionBookingBanner />
              {reviewTimeMissing ? <span className="sr-only">No time selected.</span> : null}
              {stepContent}
            </div>

            {currentStep === 3 && !paymentEntryAllowed ? (
              <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {paymentBlockMessage}
              </div>
            ) : null}

            {/* Inline nav — natural flow (no nested scroll / fixed bar) */}
            <div
              className={cn(
                "mt-4 flex flex-col-reverse gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-6 sm:flex-row sm:items-center sm:justify-between",
                currentStep === 4 && "items-center sm:justify-center",
                !showShellNavigation && "hidden",
              )}
            >
              <Button
                variant="outline"
                size="lg"
                onClick={goBack}
                disabled={paymentEditResetting}
                suppressHydrationWarning
                className={cn(
                  "w-full rounded-xl bg-card shadow-[var(--ui-shadow-sm)] sm:w-auto",
                  currentStep === 4 && "w-auto",
                )}
              >
                {currentStep === 1 ? "← Back to services" : "← Back"}
              </Button>

              {currentStep < 4 && (
                <Button
                  size="lg"
                  onClick={goNext}
                  disabled={paymentEditResetting || (currentStep === 3 && !paymentEntryAllowed)}
                  suppressHydrationWarning
                  className="w-full rounded-xl sm:w-auto"
                >
                  {currentStep === 3 ? "Proceed to payment →" : "Continue →"}
                </Button>
              )}
            </div>
          </div>

          {showSidebarSummary && (
            <aside className="hidden w-full max-w-[360px] self-start justify-self-start lg:block">
              <div
                className="fixed z-20 w-[360px] max-w-[calc(100vw-var(--ui-page-gutter))] overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  top: "calc(7.5rem + env(safe-area-inset-top))",
                  maxHeight: "calc(100dvh - 8.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
                }}
              >
                <BookingV2SummaryPanel />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export function BookingV2Shell({ serviceSlug }: { serviceSlug: ServiceSlug }) {
  return (
    <Suspense>
      <BookingV2Provider serviceSlug={serviceSlug}>
        <BookingV2Inner />
      </BookingV2Provider>
    </Suspense>
  );
}
