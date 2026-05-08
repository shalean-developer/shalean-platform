"use client";

import { ChevronDown, Lock } from "lucide-react";
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UpsellRecommendations } from "@/components/booking/UpsellRecommendations";
import { useRouter } from "next/navigation";
import BookingLayout from "@/components/booking/BookingLayout";
import { SectionCard } from "@/components/booking/SectionCard";
import { HomeDetails } from "@/components/booking/HomeDetails";
import { RecommendedExtras } from "@/components/booking/RecommendedExtras";
import { SmartRetentionBanner } from "@/components/booking/SmartRetentionBanner";
import { DetailsPriceAnchor } from "@/components/booking/DetailsPriceAnchor";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import {
  bookingServiceIdFromType,
  normalizeStep1ForService,
  SERVICE_TYPE_DISPLAY,
  serviceSupportsCleaningFrequencyPlan,
  type BookingServiceTypeKey,
} from "@/components/booking/serviceCategories";
import { bookingCopy } from "@/lib/booking/copy";
import { clearLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { CleaningFrequencySelector } from "@/components/booking/CleaningFrequencySelector";
import { MobileFullWidth } from "@/components/booking/MobileFullWidth";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import {
  ANALYTICS_EVENTS,
  BOOKING_FUNNEL_ROW,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import {
  applyCleaningFrequencyDisplayDiscount,
  cleaningFrequencyDiscountFraction,
  cleaningFrequencyPlanDisplayLabel,
} from "@/lib/booking/cleaningFrequencyDisplayDiscount";
import { getBookingExperimentAssignments } from "@/lib/booking/bookingExperiments";
import { croPriceDisplay } from "@/lib/booking/bookingCroVariants";
import { buildAiQuoteRecommendation } from "@/lib/booking/aiQuoteRecommendations";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import { Button } from "@/components/ui/button";

const ExtrasSection = lazy(() =>
  import("@/components/booking/ExtrasSection").then((m) => ({ default: m.ExtrasSection })),
);

const DETAILS_SERVICE_TYPES: readonly BookingServiceTypeKey[] = [
  "standard_cleaning",
  "airbnb_cleaning",
  "deep_cleaning",
  "move_cleaning",
  "carpet_cleaning",
] as const;

export function StepDetailsForm() {
  const router = useRouter();
  const { bookingHref } = useBookingFlow();
  const copy = bookingCopy.details;
  const booking = useBookingStep1();
  const { state, setState, maxRooms, blockedExtras, canContinue, hydrated } = booking;
  const experiments = useMemo(() => getBookingExperimentAssignments(), []);

  const { tier: vipTier } = useBookingVipTier();
  const { canonicalTotalZar, canonicalDurationHours } = useBookingPrice();
  const pastHints = usePastBookingHints();
  const locked = useLockedBooking();
  const isLocked = locked != null;
  const skipLockClearOnMount = useRef(true);
  const trackedDetailsStartedRef = useRef(false);
  const extrasSignature = state.extras.join(",");
  const [extrasPanelOpen, setExtrasPanelOpen] = useState(() => state.extras.length > 0);

  /** Blueprint CTA copy — consistent funnel label (analytics `cta_label` matches UI). */
  const detailsCta = copy.cta;

  useEffect(() => {
    if (state.extras.length > 0) {
      setExtrasPanelOpen(true);
    }
  }, [state.extras.length]);

  useEffect(() => {
    router.prefetch(bookingHref("when"));
    router.prefetch(bookingHref("checkout"));
    router.prefetch(bookingHref("quote"));
  }, [bookingHref, router]);

  /** Canonical list price per visit (engine) — passed to upsells / bundles. */
  const estimateZar = canonicalTotalZar;
  const extrasTitle =
    experiments.addons_layout === "inline_chips" ? copy.extrasTitleAlt : copy.extrasTitle;
  const priceDisplay = croPriceDisplay(experiments, estimateZar, canonicalDurationHours, "Total");
  const smartQuote = useMemo(
    () => buildAiQuoteRecommendation(state, canonicalDurationHours),
    [state, canonicalDurationHours],
  );
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

  const displayZarForAnchor = (planEligible ? discountedDisplayZar : null) ?? estimateZar;
  const anchorHoursLine =
    canonicalDurationHours != null && Number.isFinite(canonicalDurationHours)
      ? formatBookingHoursCompact(canonicalDurationHours)
      : "—";
  const anchorPriceLine =
    priceDisplay.amountDisplayOverride ??
    (displayZarForAnchor != null ? `R ${displayZarForAnchor.toLocaleString("en-ZA")}` : "—");

  const selectService = useCallback(
    (primary: BookingServiceTypeKey) => {
      const group =
        primary === "standard_cleaning" || primary === "airbnb_cleaning" ? "regular" : "specialised";
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED, state, {
        service_type: primary,
        service_group: group,
        selected_extras: state.extras,
        estimated_price: estimateZar,
        estimated_hours: canonicalDurationHours,
      });
      setState((p) =>
        normalizeStep1ForService({
          ...p,
          subServices: [primary],
          selectedCategory: group,
          service_group: group,
          service_type: primary,
          service: bookingServiceIdFromType(primary),
        }),
      );
    },
    [canonicalDurationHours, estimateZar, setState, state],
  );

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
    extrasSignature,
    state.cleaningFrequency,
    state.service_type,
    state.service,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (trackedDetailsStartedRef.current) return;
    trackedDetailsStartedRef.current = true;
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_STEP_DETAILS_STARTED, state, {
      estimated_price: estimateZar,
      estimated_hours: canonicalDurationHours,
    });
  }, [canonicalDurationHours, estimateZar, hydrated, state]);

  const goWhen = () => {
    if (!canContinue) return;
    trackBookingFunnelEvent("extras", BOOKING_FUNNEL_ROW.NEXT, { route_step: "details" });
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CTA_CLICKED, state, {
      cta_id: "details_continue_schedule",
      cta_label: detailsCta,
      cta_destination_step: "when",
      step: "details",
      estimated_price: estimateZar,
      estimated_hours: canonicalDurationHours,
      experiment_cta_copy: experiments.cta_copy,
      experiment_trust_badges: experiments.trust_badges,
      experiment_addons_layout: experiments.addons_layout,
      experiment_pricing_display: experiments.pricing_display,
    });
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CONTINUE_SCHEDULE, state, {
      estimated_price: estimateZar,
      estimated_hours: canonicalDurationHours,
    });
    startTransition(() => {
      router.push(bookingHref("when"));
    });
  };

  const extrasContent = (
    <div className="space-y-3 lg:space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{copy.reassurance}</p>
      {!isLocked && state.service ? (
        <MobileFullWidth>
          <UpsellRecommendations
            state={state}
            blockedExtras={blockedExtras}
            setState={setState}
            pastHints={pastHints}
            estimateZar={estimateZar}
          />
        </MobileFullWidth>
      ) : null}
      <MobileFullWidth insideSectionCard>
        <ExtrasSection state={state} blockedExtras={blockedExtras} setState={setState} />
      </MobileFullWidth>
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
    </div>
  );

  const mobileTrustStrip = (
    <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
      <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span>{copy.footerTrustCompact}</span>
    </p>
  );

  return (
    <BookingLayout
      summaryIgnoreLockedBooking
      summaryDesktopOnly
      summaryState={state}
      stickyMobileBar={{
        totalZar: (planEligible ? discountedDisplayZar : null) ?? estimateZar ?? 0,
        amountDisplayOverride: priceDisplay.amountDisplayOverride,
        planPriceBreakdown,
        totalCaption: priceDisplay.totalCaption,
        mobileHoursLine: priceDisplay.mobileHoursLine,
        ctaShort: detailsCta,
        openSummarySheetOnAmountTap: true,
        trustBelowCta: mobileTrustStrip,
      }}
      footerInsightBanner={{ variant: "details" }}
      canContinue={canContinue}
      onContinue={goWhen}
      continueLabel={detailsCta}
    >
      <div className="w-full max-w-none space-y-3 pb-4 sm:pb-5 lg:space-y-5 lg:pb-6">
        {isLocked ? (
          <div
            className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100 sm:px-4 sm:py-3"
            role="status"
          >
            <span>This booking is locked for checkout. Continue when you are ready to schedule or pay.</span>
          </div>
        ) : null}

        {!isLocked ? <SmartRetentionBanner /> : null}

        <header className="w-full max-w-none space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-blue-700 dark:text-blue-400 sm:text-2xl">
              {copy.title}
            </h1>
            <span className="hidden rounded-full border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 sm:inline dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              {copy.priceShownBadge}
            </span>
          </div>
          <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">{copy.stepSubtitle}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">{copy.priceLiveHint}</p>
        </header>

        {smartQuote ? (
          <div className="rounded-xl border border-blue-100/90 bg-blue-50/60 px-3 py-2.5 text-sm text-blue-950 dark:border-blue-900/45 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-semibold">{smartQuote.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-900/85 dark:text-blue-100/85">{smartQuote.body}</p>
          </div>
        ) : null}

        <fieldset
          disabled={isLocked}
          className="w-full max-w-none min-w-0 border-0 p-0 disabled:pointer-events-none disabled:opacity-[0.55]"
        >
          <section className="overflow-hidden rounded-xl border border-zinc-200/85 bg-white shadow-sm shadow-zinc-900/[0.05] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/25">
            <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
              {/* Service */}
              <div className="space-y-2">
                <label
                  htmlFor="details-service"
                  className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {copy.yourServiceLabel}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                  <div className="relative min-w-0 flex-1">
                    <select
                      id="details-service"
                      className="min-h-11 w-full appearance-none rounded-xl border border-zinc-200/90 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-zinc-900 shadow-sm outline-none transition hover:border-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-blue-400 dark:focus:ring-blue-400/25"
                      disabled={isLocked}
                      value={state.service_type ?? ""}
                      onChange={(e) => {
                        const v = e.target.value as BookingServiceTypeKey;
                        if (v) selectService(v);
                      }}
                    >
                      <option value="" disabled>
                        Select a service
                      </option>
                      {DETAILS_SERVICE_TYPES.map((id) => (
                        <option key={id} value={id}>
                          {SERVICE_TYPE_DISPLAY[id]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
                      aria-hidden
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLocked}
                    className="hidden h-11 shrink-0 px-4 font-medium sm:inline-flex"
                    onClick={() => startTransition(() => router.push(bookingHref("quote")))}
                  >
                    {copy.changeService}
                  </Button>
                </div>
                <button
                  type="button"
                  disabled={isLocked}
                  className="text-left text-sm font-semibold text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 sm:hidden dark:text-blue-400"
                  onClick={() => startTransition(() => router.push(bookingHref("quote")))}
                >
                  {copy.changeService}
                </button>
              </div>

              {/* Property */}
              <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
                <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {copy.propertySectionLabel}
                </p>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/35">
                  <HomeDetails
                    state={state}
                    maxRooms={maxRooms}
                    setState={setState}
                    omitLocation
                    stepperVariant="segmented"
                  />
                </div>
              </div>

              {/* Extras — collapsed default */}
              <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
                <Suspense
                  fallback={
                    <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      Loading extras…
                    </div>
                  }
                >
                  <div id="extras" className="scroll-mt-24">
                    <details
                      className={[
                        "group rounded-xl border border-zinc-200/80 bg-white shadow-sm transition-shadow duration-200 open:shadow-md dark:border-zinc-700 dark:bg-zinc-950 dark:open:shadow-md",
                        experiments.addons_layout === "bottom_drawer" ? "" : "",
                      ].join(" ")}
                      open={extrasPanelOpen}
                      onToggle={(e) => setExtrasPanelOpen(e.currentTarget.open)}
                    >
                      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden sm:min-h-14 sm:px-4">
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                            {copy.showExtrasCollapsed}
                          </span>
                          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                            {extrasTitle}
                          </span>
                        </span>
                        <ChevronDown
                          className="h-5 w-5 shrink-0 text-zinc-500 transition duration-200 group-open:rotate-180 dark:text-zinc-400"
                          aria-hidden
                        />
                      </summary>
                      <div
                        className={[
                          "border-t border-zinc-200/80 px-3 pb-4 pt-3 dark:border-zinc-700 sm:px-4 sm:pb-5 sm:pt-4",
                          experiments.addons_layout === "bottom_drawer" ? "rounded-t-3xl" : "",
                        ].join(" ")}
                      >
                        {extrasContent}
                      </div>
                    </details>
                  </div>
                </Suspense>
              </div>

              {/* Price anchor */}
              <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
                <DetailsPriceAnchor
                  hoursLine={anchorHoursLine}
                  priceLine={anchorPriceLine}
                  footnote={copy.priceAnchorFootnote}
                />
              </div>
            </div>
          </section>

          {planEligible ? (
            <div className="mt-4 lg:mt-5">
              <SectionCard title="Choose cleaning frequency">
                <MobileFullWidth insideSectionCard>
                  <CleaningFrequencySelector
                    value={state.cleaningFrequency}
                    onChange={(next) => setState((p) => ({ ...p, cleaningFrequency: next }))}
                  />
                </MobileFullWidth>
              </SectionCard>
            </div>
          ) : null}
        </fieldset>
      </div>
    </BookingLayout>
  );
}
