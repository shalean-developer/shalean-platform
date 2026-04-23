"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { clearBookingPricePreviewFromStorage } from "@/lib/booking/bookingPricePreview";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import {
  type BookingServiceTypeKey,
  bookingServiceIdFromType,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";
import { SubServicesSelector } from "@/components/booking/SubServicesSelector";

export function StepQuote() {
  const router = useRouter();
  const booking = useBookingStep1();
  const { state, setState, hydrated } = booking;
  const copy = bookingCopy.quote;

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
      summaryState={state}
      canContinue={canContinue}
      onContinue={() => router.push(bookingFlowHref("details"))}
      continueLabel={copy.cta}
    >
      <div className="mx-auto max-w-2xl space-y-8 pb-6 lg:mx-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {copy.title}
          </h1>
        </div>

        <section className="space-y-3" aria-labelledby="sub-services-heading">
          <h2 id="sub-services-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Sub-services (optional)
          </h2>
          <SubServicesSelector selectedService={state.service_type ?? null} onSelect={selectService} />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Select one service</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Anything else we should know?</h2>
          <textarea
            value={state.notes ?? ""}
            onChange={(e) => setState((p) => ({ ...p, notes: e.target.value.slice(0, 1200) }))}
            placeholder="Add notes (optional)"
            rows={4}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </section>
      </div>
    </BookingLayout>
  );
}
