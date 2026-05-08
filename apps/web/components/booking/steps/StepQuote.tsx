"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingCopy } from "@/lib/booking/copy";
import { clearBookingPricePreviewFromStorage } from "@/lib/booking/bookingPricePreview";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import {
  type BookingServiceTypeKey,
  bookingServiceIdFromType,
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";
import { SubServicesSelector } from "@/components/booking/SubServicesSelector";
import {
  ANALYTICS_EVENTS,
  BOOKING_FUNNEL_ROW,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { extrasLineItemsForService } from "@/lib/pricing/extrasConfig";
import { bookingMarketingPromoExtra } from "@/lib/booking/bookingFlow";
import { getBookingExperimentAssignments } from "@/lib/booking/bookingExperiments";
import { croCtaLabel, croCtaShort, croPriceDisplay } from "@/lib/booking/bookingCroVariants";

export function StepQuote() {
  const router = useRouter();
  const { bookingHref, promoParam } = useBookingFlow();
  const booking = useBookingStep1();
  const { state, setState, hydrated } = booking;
  const copy = bookingCopy.quote;
  const { canonicalTotalZar, canonicalDurationHours, catalog } = useBookingPrice();
  const experiments = useMemo(() => getBookingExperimentAssignments(), []);

  const estimateZar = canonicalTotalZar;
  const quoteCta = croCtaLabel(experiments);
  const priceDisplay = croPriceDisplay(experiments, estimateZar, canonicalDurationHours, "Total");

  const selectedExtras = useMemo(() => {
    if (!catalog) return [];
    return extrasLineItemsForService(state.extras, state.service, catalog);
  }, [state.extras, state.service, catalog]);

  useEffect(() => {
    clearBookingPricePreviewFromStorage();
  }, []);

  useEffect(() => {
    router.prefetch(bookingHref("details"));
    router.prefetch(bookingHref("when"));
  }, [bookingHref, router]);

  /** Default funnel on quote when nothing chosen yet (e.g. deep-linked without step 1). */
  useEffect(() => {
    if (!hydrated) return;
    const hasSubServices = (state.subServices?.length ?? 0) > 0;
    const hasService = state.service != null || hasSubServices;
    if (hasSubServices) return;

    // Preserve homepage-hydrated service; only backfill subServices for selector UX.
    if (state.service) {
      const inferredType = state.service_type ?? inferServiceTypeFromServiceId(state.service);
      const inferredGroup = inferServiceGroupFromServiceId(state.service);
      if (!inferredType) return;
      setState((p) =>
        normalizeStep1ForService({
          ...p,
          subServices: [inferredType],
          selectedCategory: p.selectedCategory ?? inferredGroup,
          service_group: p.service_group ?? inferredGroup,
          service_type: inferredType,
        }),
      );
      return;
    }

    if (hasService) return;
    setState((p) =>
      normalizeStep1ForService({
        ...p,
        subServices: ["standard_cleaning"],
        selectedCategory: "regular",
        service_group: "regular",
        service_type: "standard_cleaning",
        service: bookingServiceIdFromType("standard_cleaning"),
      }),
    );
  }, [hydrated, setState, state.service, state.service_type, state.subServices]);

  const selectService = useCallback(
    (primary: BookingServiceTypeKey) => {
      const group = primary === "standard_cleaning" || primary === "airbnb_cleaning" ? "regular" : "specialised";
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

  const canContinue = Boolean(state.service && state.service_type);

  return (
    <BookingLayout
      summaryIgnoreLockedBooking
      summaryDesktopOnly
      summaryState={state}
      stickyMobileBar={{
        totalZar: estimateZar ?? 0,
        amountDisplayOverride: priceDisplay.amountDisplayOverride,
        totalCaption: priceDisplay.totalCaption,
        mobileHoursLine: priceDisplay.mobileHoursLine,
        ctaShort: croCtaShort(experiments),
        openSummarySheetOnAmountTap: true,
      }}
      footerInsightBanner={{ variant: "quote" }}
      canContinue={canContinue}
      onContinue={() => {
        trackBookingFunnelEvent("quote", BOOKING_FUNNEL_ROW.NEXT, { route_step: "quote" });
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CTA_CLICKED, state, {
          cta_id: "quote_continue",
          cta_label: quoteCta,
          experiment_cta_copy: experiments.cta_copy,
          experiment_pricing_display: experiments.pricing_display,
          cta_destination_step: "details",
          step: "quote",
          selected_extras: state.extras,
          estimated_price: estimateZar,
          estimated_hours: canonicalDurationHours,
        });
        const welcomePromo = promoParam == null ? bookingMarketingPromoExtra("SAVE10") : undefined;
        startTransition(() => {
          router.push(bookingHref("details", welcomePromo));
        });
      }}
      continueLabel={quoteCta}
    >
      <div className="mx-auto w-full max-w-[576px] space-y-3 pb-4 lg:space-y-8 lg:pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {copy.title}
          </h1>
          {estimateZar == null ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 sm:mt-3">Choose a cleaning type to continue.</p>
          ) : null}
          <p
            className={`text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 ${estimateZar == null ? "mt-2" : "mt-2 sm:mt-3"}`}
          >
            {copy.reassurance}
          </p>
        </div>

        <section className="space-y-2.5 sm:space-y-3" aria-labelledby="sub-services-heading">
          <h2 id="sub-services-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {copy.serviceSectionTitle}
          </h2>
          <SubServicesSelector
            selectedService={state.service_type ?? null}
            onSelect={selectService}
            popularLabel={copy.mostPopularLabel}
            recommendedLabel={copy.recommendedServiceLabel}
            fromPriceById={copy.serviceFromPriceLine}
            dominantPopular
          />
        </section>

        <p className="rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-center text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
          {copy.midFlowSocialProof}
        </p>

        {selectedExtras.length > 0 ? (
          <section className="space-y-2" aria-labelledby="quote-extras-heading">
            <h2 id="quote-extras-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Selected extras
            </h2>
            <ul className="space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
              {selectedExtras.map((row) => (
                <li key={row.slug} className="flex items-center justify-between gap-2 text-zinc-800 dark:text-zinc-100">
                  <span className="min-w-0">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">R {row.price.toLocaleString("en-ZA")}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">You can change these on the next step before you pick a time.</p>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{copy.notesHeading}</h2>
          <textarea
            value={state.notes ?? ""}
            onChange={(e) => setState((p) => ({ ...p, notes: e.target.value.slice(0, 1200) }))}
            placeholder={copy.notesPlaceholder}
            rows={4}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </section>
      </div>
    </BookingLayout>
  );
}
