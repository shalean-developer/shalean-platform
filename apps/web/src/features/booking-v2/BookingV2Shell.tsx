"use client";

import { Suspense } from "react";
import { BookingV2Provider, useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { BookingV2Header } from "@/src/features/booking-v2/components/BookingV2Header";
import { BookingV2SummaryPanel } from "@/src/features/booking-v2/components/BookingV2SummaryPanel";
import { Step1Details } from "@/src/features/booking-v2/steps/Step1Details";
import { Step2Schedule } from "@/src/features/booking-v2/steps/Step2Schedule";
import { Step3Review } from "@/src/features/booking-v2/steps/Step3Review";
import { Step4Payment } from "@/src/features/booking-v2/steps/Step4Payment";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { useBookingV2FunnelTelemetry } from "@/src/features/booking-v2/hooks/useBookingV2FunnelTelemetry";
import { useBookingV2Pricing } from "@/src/features/booking-v2/hooks/useBookingV2Pricing";
import { useClientMounted } from "@/src/features/booking-v2/hooks/useClientMounted";

function BookingV2LoadingShell() {
  return (
    <div className="min-h-dvh bg-slate-50" aria-busy="true" aria-label="Loading booking form">
      <div className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mx-auto hidden h-8 max-w-sm flex-1 animate-pulse rounded-full bg-slate-100 sm:block" />
          <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            <div className="animate-pulse space-y-6">
              <div className="mx-auto h-7 w-40 rounded bg-slate-200" />
              <div className="mx-auto h-4 w-72 max-w-full rounded bg-slate-100" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 rounded-xl bg-slate-100" />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4">
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

  return (
    <div className="min-h-dvh bg-slate-50">
      <BookingV2Header serviceSlug={serviceSlug} currentStep={currentStep} onStepClick={goToStep} />

      {/* Main content area */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className={
          currentStep <= 2
            ? "grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]"
            : "mx-auto max-w-2xl"
        }>
          {/* Step content */}
          <div className="min-w-0">
            {/* Mobile summary — only on steps 1 & 2 */}
            {currentStep <= 2 && (
              <div className="mb-6 lg:hidden">
                <BookingV2SummaryPanel collapsed />
              </div>
            )}

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
              {stepContent}
            </div>

            {/* Navigation buttons */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                suppressHydrationWarning
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {currentStep === 1 ? "← Back to services" : "← Back"}
              </button>

              {currentStep < 4 && (
                <button
                  type="button"
                  onClick={goNext}
                  suppressHydrationWarning
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  {currentStep === 3 ? "Proceed to payment →" : "Continue →"}
                </button>
              )}
            </div>
          </div>

          {/* Desktop sticky summary — only on steps 1 & 2 */}
          {currentStep <= 2 && (
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
