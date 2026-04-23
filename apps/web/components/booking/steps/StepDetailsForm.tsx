"use client";

import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
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
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { clearLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { CleaningFrequencySelector } from "@/components/booking/CleaningFrequencySelector";
import { MobileFullWidth } from "@/components/booking/MobileFullWidth";
import { estimateFromSmartQuoteMin } from "@/lib/booking/smartQuoteEstimate";

const ExtrasSection = lazy(() =>
  import("@/components/booking/ExtrasSection").then((m) => ({ default: m.ExtrasSection })),
);

export function StepDetailsForm() {
  const router = useRouter();
  const copy = bookingCopy.details;
  const booking = useBookingStep1();
  const { state, setState, maxRooms, blockedExtras, canContinue, hydrated } = booking;

  const { tier: vipTier } = useBookingVipTier();
  const pastHints = usePastBookingHints();
  const locked = useLockedBooking();
  const isLocked = locked != null;
  const skipLockClearOnMount = useRef(true);

  const estimateZar = useMemo(() => estimateFromSmartQuoteMin(state, vipTier), [state, vipTier]);

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

  const recurringDiscountPct =
    state.cleaningFrequency === "weekly" ? 0.1 : state.cleaningFrequency === "biweekly" ? 0.05 : 0;

  const goWhen = () => {
    if (!canContinue) return;
    router.push(bookingFlowHref("when"));
  };

  return (
    <BookingLayout
      summaryIgnoreLockedBooking
      summaryDesktopOnly
      summaryState={state}
      stickyMobileBar={{
        totalZar: estimateZar ?? 0,
        amountDisplayOverride: estimateZar == null ? "—" : null,
        totalCaption: "From",
        ctaShort: "Continue →",
        openSummarySheetOnAmountTap: true,
      }}
      canContinue={canContinue}
      onContinue={goWhen}
      continueLabel={copy.cta}
    >
      <div className="w-full max-w-none space-y-5 pb-6 max-lg:space-y-5 lg:space-y-6">
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
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{copy.priceLiveHint}</p>
        </div>

        <fieldset
          disabled={isLocked}
          className="w-full max-w-none min-w-0 space-y-5 border-0 p-0 disabled:pointer-events-none disabled:opacity-[0.55] max-lg:space-y-4 lg:space-y-5"
        >
          <SectionCard title={copy.homeDetailsTitle} description={copy.homeDetailsHint} descriptionDesktopOnly>
            <MobileFullWidth insideSectionCard>
              <HomeDetails state={state} maxRooms={maxRooms} setState={setState} omitLocation />
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

          <SectionCard title="Choose cleaning frequency">
            <MobileFullWidth insideSectionCard>
              <CleaningFrequencySelector
                value={state.cleaningFrequency}
                onChange={(next) => setState((p) => ({ ...p, cleaningFrequency: next }))}
              />
            </MobileFullWidth>
            {recurringDiscountPct > 0 ? (
              <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 max-lg:mt-2 lg:mt-3">
                {state.cleaningFrequency === "weekly"
                  ? "Weekly plan: 10% off each visit — applied at checkout after your time is locked."
                  : "Every 2 weeks: 5% off each visit — applied at checkout after your time is locked."}
              </p>
            ) : null}
          </SectionCard>

          <Suspense
            fallback={
              <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Loading extras…
              </div>
            }
          >
            <SectionCard id="extras" title={copy.extrasTitle} description={copy.reassurance} descriptionDesktopOnly>
              <MobileFullWidth insideSectionCard>
                <ExtrasSection state={state} blockedExtras={blockedExtras} setState={setState} />
              </MobileFullWidth>
            </SectionCard>
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
        </fieldset>
      </div>
    </BookingLayout>
  );
}
