"use client";

import { Suspense } from "react";
import { BookingV2Provider, useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { BookingV2Header } from "@/src/features/booking-v2/components/BookingV2Header";
import { BookingV2SummaryPanel } from "@/src/features/booking-v2/components/BookingV2SummaryPanel";
import { Step1Details } from "@/src/features/booking-v2/steps/Step1Details";
import { Step2Schedule } from "@/src/features/booking-v2/steps/Step2Schedule";
import { Step3Review } from "@/src/features/booking-v2/steps/Step3Review";
import { Step4Payment } from "@/src/features/booking-v2/steps/Step4Payment";
import { PromotionBookingBanner } from "@/components/promotions/PromotionBookingBanner";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { useBookingV2FunnelTelemetry } from "@/src/features/booking-v2/hooks/useBookingV2FunnelTelemetry";
import { useBookingV2Pricing } from "@/src/features/booking-v2/hooks/useBookingV2Pricing";
import { useClientMounted } from "@/src/features/booking-v2/hooks/useClientMounted";

function BookingV2LoadingShell() {
  return (
    <div className="min-h-dvh bg-slate-50" aria-busy="true" aria-label="Loading booking form">
      <div className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
          <div className="mx-auto hidden h-8 max-w-sm flex-1 animate-pulse rounded-full bg-slate-100 sm:block" />
          <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(280px,340px)]">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:p-8">
            <div className="animate-pulse space-y-6">
              <div className="mx-auto h-7 w-40 rounded bg-slate-200" />
              <div className="mx-auto h-4 w-72 max-w-full rounded bg-slate-100" />
              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl bg-slate-100" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl bg-slate-100" />
                ))}
              </div>
              <div className="h-10 rounded-xl bg-slate-100" />
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="h-72 animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingV2Inner() {
  const mounted = useClientMounted();
  const { currentStep, goToStep, goNext, goBack, serviceSlug } = useBookingV2();
  useBookingV2Pricing();
  useBookingV2FunnelTelemetry(currentStep, serviceSlug);

  if (!mounted) {
    return <BookingV2LoadingShell />;
  }

  const stepContent = {
    1: <Step1Details />,
    2: <Step2Schedule />,
    3: <Step3Review />,
    4: <Step4Payment />,
  }[currentStep];

  const showSidebarSummary = currentStep <= 2;
  /** Steps 3–4 already use section cards — avoid card-in-card chrome that squeezes mobile. */
  const useOuterStepCard = currentStep <= 2;

  return (
    <div className="min-h-dvh bg-slate-50">
      <BookingV2Header serviceSlug={serviceSlug} currentStep={currentStep} onStepClick={goToStep} />

      {/* Main content — single document scroll; fluid padding for ≤390px */}
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <div
          className={
            showSidebarSummary
              ? "grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_minmax(280px,340px)]"
              : "mx-auto max-w-2xl"
          }
        >
          <div className="min-w-0">
            {showSidebarSummary && (
              <div className="mb-4 sm:mb-6 lg:hidden">
                <BookingV2SummaryPanel collapsed />
              </div>
            )}

            <div
              className={
                useOuterStepCard
                  ? "rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:p-8"
                  : "min-w-0"
              }
            >
              <PromotionBookingBanner />
              {stepContent}
            </div>

            {/* Inline nav — natural flow (no nested scroll / fixed bar) */}
            <div className="mt-4 flex flex-col-reverse gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={goBack}
                suppressHydrationWarning
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
              >
                {currentStep === 1 ? "← Back to services" : "← Back"}
              </button>

              {currentStep < 4 && (
                <button
                  type="button"
                  onClick={goNext}
                  suppressHydrationWarning
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
                >
                  {currentStep === 3 ? "Proceed to payment →" : "Continue →"}
                </button>
              )}
            </div>
          </div>

          {showSidebarSummary && (
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <BookingV2SummaryPanel />
              </div>
            </div>
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
