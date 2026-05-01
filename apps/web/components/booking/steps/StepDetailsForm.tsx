"use client";

import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { UpsellRecommendations } from "@/components/booking/UpsellRecommendations";
import { useRouter } from "next/navigation";
import BookingLayout from "@/components/booking/BookingLayout";
import { SectionCard } from "@/components/booking/SectionCard";
import { HomeDetails } from "@/components/booking/HomeDetails";
import { RecommendedExtras } from "@/components/booking/RecommendedExtras";
import { SmartRetentionBanner } from "@/components/booking/SmartRetentionBanner";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { serviceSupportsCleaningFrequencyPlan } from "@/components/booking/serviceCategories";
import { bookingCopy } from "@/lib/booking/copy";
import { clearLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { CleaningFrequencySelector } from "@/components/booking/CleaningFrequencySelector";
import { MobileFullWidth } from "@/components/booking/MobileFullWidth";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import {
  applyCleaningFrequencyDisplayDiscount,
  cleaningFrequencyDiscountFraction,
  cleaningFrequencyPlanDisplayLabel,
} from "@/lib/booking/cleaningFrequencyDisplayDiscount";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";

const ExtrasSection = lazy(() =>
  import("@/components/booking/ExtrasSection").then((m) => ({ default: m.ExtrasSection })),
);

export function StepDetailsForm() {
  const router = useRouter();
  const { bookingHref } = useBookingFlow();
  const copy = bookingCopy.details;
  const booking = useBookingStep1();
  const { state, setState, maxRooms, blockedExtras, canContinue, hydrated } = booking;

  const { tier: vipTier } = useBookingVipTier();
  const { canonicalTotalZar, canonicalDurationHours } = useBookingPrice();
  const pastHints = usePastBookingHints();
  const locked = useLockedBooking();
  const isLocked = locked != null;
  const skipLockClearOnMount = useRef(true);

  /** Canonical list price per visit (engine) — passed to upsells / bundles. */
  const estimateZar = canonicalTotalZar;
  const planEligible = serviceSupportsCleaningFrequencyPlan(state.service, state.service_type);
  const frequencyForPlan = planEligible ? state.cleaningFrequency : "one_time";
  const discountFrac = cleaningFrequencyDiscountFraction(frequencyForPlan);
  const planLabel = cleaningFrequencyPlanDisplayLabel(frequencyForPlan);
  const discountedDisplayZar =
    canonicalTotalZar != null && discountFrac > 0
      ? applyCleaningFrequencyDisplayDiscount(canonicalTotalZar, frequencyForPlan)
      : null;
  const planPriceBreakdown =
    planEligible &&
    !isLocked &&
    canonicalTotalZar != null &&
    discountedDisplayZar != null &&
    planLabel &&
    discountFrac > 0
      ? { baseZar: canonicalTotalZar, discountedZar: discountedDisplayZar, planLabel }
      : null;

  useEffect(() => {
    if (skipLockClearOnMount.current) {
      skipLockClearOnMount.current = false;
      return;
    }
    if (!locked) return;
    clearLockedBookingFromStorage();
    clearSelectedCleanerFromStorage();
  }, [
    locked,
    state.rooms,
    state.bathrooms,
    state.extraRooms,
    state.extras.join(","),
    state.cleaningFrequency,
    state.service_type,
    state.service,
  ]);

  const goWhen = () => {
    if (!canContinue) return;
    trackBookingFunnelEvent("extras", "next", { route_step: "details" });
    router.push(bookingHref("when"));
  };

  return (
    <BookingLayout
      summaryIgnoreLockedBooking
      summaryDesktopOnly
      summaryState={state}
      stickyMobileBar={{
        totalZar: (planEligible ? discountedDisplayZar : null) ?? estimateZar ?? 0,
        amountDisplayOverride: estimateZar == null ? "—" : null,
        planPriceBreakdown,
        totalCaption: "From",
        mobileHoursLine:
          canonicalDurationHours != null ? formatBookingHoursCompact(canonicalDurationHours) : null,
        ctaShort: "Continue →",
        openSummarySheetOnAmountTap: true,
      }}
      footerInsightBanner={{ variant: "details" }}
      canContinue={canContinue}
      onContinue={goWhen}
      continueLabel={copy.cta}
    >
      <div className="w-full max-w-none space-y-4 pb-6 lg:space-y-6">
        {isLocked ? (
          <div
            className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            <span>This booking is locked for checkout. Continue when you are ready to schedule or pay.</span>
          </div>
        ) : null}

        {!isLocked ? <SmartRetentionBanner /> : null}

        <div className="w-full max-w-none">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{copy.priceLiveHint}</p>
        </div>

        <fieldset
          disabled={isLocked}
          className="w-full max-w-none min-w-0 space-y-4 border-0 p-0 disabled:pointer-events-none disabled:opacity-[0.55] lg:space-y-5"
        >
          <SectionCard title={copy.homeDetailsTitle} description={copy.homeDetailsHint} descriptionDesktopOnly>
            <MobileFullWidth insideSectionCard>
              <HomeDetails
                state={state}
                maxRooms={maxRooms}
                setState={setState}
                omitLocation
              />
            </MobileFullWidth>
          </SectionCard>

          {!isLocked && state.service ? (
            <MobileFullWidth>
              <UpsellRecommendations
                state={state}
                blockedExtras={blockedExtras}
                setState={setState}
                estimateZar={estimateZar}
              />
            </MobileFullWidth>
          ) : null}

          <Suspense
            fallback={
              <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Loading extras…
              </div>
            }
          >
            <div id="extras" className="scroll-mt-24">
            <details className="group w-full rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/20 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-semibold tracking-tight text-zinc-900 marker:content-none dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                <span>{copy.extrasTitle}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180 dark:text-zinc-400"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-zinc-200/80 px-3 pb-4 pt-2 dark:border-zinc-800">
                <MobileFullWidth insideSectionCard>
                  <ExtrasSection state={state} blockedExtras={blockedExtras} setState={setState} />
                </MobileFullWidth>
              </div>
            </details>
            <div className="hidden lg:block">
              <SectionCard title={copy.extrasTitle} description={copy.reassurance} descriptionDesktopOnly>
                <MobileFullWidth insideSectionCard>
                  <ExtrasSection state={state} blockedExtras={blockedExtras} setState={setState} />
                </MobileFullWidth>
              </SectionCard>
            </div>
            </div>
          </Suspense>

          {state.service ? (
            <MobileFullWidth>
              <RecommendedExtras
                state={state}
                setState={setState}
                blockedExtras={blockedExtras}
                userTier={vipTier}
                pastHints={pastHints}
              />
            </MobileFullWidth>
          ) : null}

          {planEligible ? (
            <SectionCard title="Choose cleaning frequency">
              <MobileFullWidth insideSectionCard>
                <CleaningFrequencySelector
                  value={state.cleaningFrequency}
                  onChange={(next) => setState((p) => ({ ...p, cleaningFrequency: next }))}
                />
              </MobileFullWidth>
            </SectionCard>
          ) : null}
        </fieldset>
      </div>
    </BookingLayout>
  );
}
