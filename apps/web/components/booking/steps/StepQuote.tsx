"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { clearBookingPricePreviewFromStorage } from "@/lib/booking/bookingPricePreview";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import {
  type BookingServiceTypeKey,
  bookingServiceIdFromType,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";
import { SubServicesSelector } from "@/components/booking/SubServicesSelector";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { extrasLineItemsForService } from "@/lib/pricing/extrasConfig";

export function StepQuote() {
  const router = useRouter();
  const booking = useBookingStep1();
  const { state, setState, hydrated } = booking;
  const copy = bookingCopy.quote;
  const { tier } = useBookingVipTier();
  const { canonicalTotalZar, catalog } = useBookingPrice();

  const estimateZar = canonicalTotalZar;

  const selectedExtras = useMemo(() => {
    if (!catalog) return [];
    return extrasLineItemsForService(state.extras, state.service, catalog);
  }, [state.extras, state.service, catalog]);

  useEffect(() => {
    clearBookingPricePreviewFromStorage();
  }, []);

  /** Default funnel on quote when nothing chosen yet (e.g. deep-linked without step 1). */
  useEffect(() => {
    if (!hydrated) return;
    if ((state.subServices?.length ?? 0) > 0) return;
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
  }, [hydrated, setState, state.subServices]);

  const selectService = useCallback(
    (primary: BookingServiceTypeKey) => {
      const group = primary === "standard_cleaning" || primary === "airbnb_cleaning" ? "regular" : "specialised";
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
    [setState],
  );

  const canContinue = Boolean(state.service && state.service_type);

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
      onContinue={() => {
        trackBookingFunnelEvent("quote", "next", { route_step: "quote" });
        router.push(bookingFlowHref("details"));
      }}
      continueLabel={copy.cta}
    >
      <div className="w-full max-w-none space-y-5 pb-4 max-lg:space-y-5 md:mx-auto md:max-w-2xl lg:mx-0 lg:space-y-8 lg:pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {copy.title}
          </h1>
          {estimateZar != null ? (
            <p className="mt-3 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              From R {estimateZar.toLocaleString("en-ZA")}
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                — same engine as checkout; updates when rooms or extras change
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">Pick a clean type to see pricing</p>
          )}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.reassurance}</p>
          <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{copy.urgency}</p>
        </div>

        <section className="space-y-3" aria-labelledby="sub-services-heading">
          <h2 id="sub-services-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {copy.serviceSectionTitle}
          </h2>
          <SubServicesSelector
            selectedService={state.service_type ?? null}
            onSelect={selectService}
            popularLabel={copy.mostPopularLabel}
            recommendedLabel={copy.recommendedServiceLabel}
          />
        </section>

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
