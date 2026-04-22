"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { calculatePrice } from "@/lib/pricing/calculatePrice";
import { writeBookingPricePreviewLock } from "@/lib/booking/bookingPricePreview";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import {
  bookingServiceIdFromType,
  getBookingSummaryServiceLabel,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";

function GroupCard({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/25 dark:bg-primary/10"
          : "border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
    </button>
  );
}

function MiniOption({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "rounded-xl border px-3 py-2.5 text-left text-xs transition-all sm:text-sm",
        selected
          ? "border-primary bg-primary/10 font-semibold text-zinc-900 dark:text-zinc-50"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
      ].join(" ")}
    >
      <span className="font-semibold">{label}</span>
      <span className="mt-0.5 block font-normal text-zinc-600 dark:text-zinc-400">{description}</span>
    </button>
  );
}

export function StepQuote() {
  const router = useRouter();
  const booking = useBookingStep1();
  const { state, setState, hydrated } = booking;
  const copy = bookingCopy.quote;

  /** Default funnel on quote when nothing chosen yet (e.g. deep-linked without step 1). */
  useEffect(() => {
    if (!hydrated) return;
    if (state.service_group != null || state.service != null) return;
    setState((p) =>
      normalizeStep1ForService({
        ...p,
        selectedCategory: "regular",
        service_group: "regular",
        service_type: "standard_cleaning",
        service: bookingServiceIdFromType("standard_cleaning"),
      }),
    );
  }, [hydrated, setState, state.service, state.service_group]);

  /** Preview pricing for specialised before a concrete option is chosen (guide only). */
  const estimateInputService = state.service ?? (state.service_group === "specialised" ? "deep" : null);
  const estimateInputType =
    state.service_type ??
    (state.service_group === "specialised" && !state.service ? ("deep_cleaning" as const) : null);

  const estimate = useMemo(
    () =>
      calculatePrice({
        service: estimateInputService,
        serviceType: estimateInputType,
        rooms: state.rooms,
        bathrooms: state.bathrooms,
        extraRooms: state.extraRooms,
        extras: state.extras,
      }),
    [
      state.bathrooms,
      state.extraRooms,
      state.extras,
      state.rooms,
      estimateInputService,
      estimateInputType,
    ],
  );

  useEffect(() => {
    if (!state.service) return;
    writeBookingPricePreviewLock({
      finalPrice: estimate.total,
      surgeMultiplier: 1,
      lockedAt: new Date().toISOString(),
      estimatedHours: estimate.hours,
      service: state.service,
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
    });
  }, [estimate.hours, estimate.total, state.bathrooms, state.extraRooms, state.extras, state.rooms, state.service]);

  const pickRegularGroup = useCallback(() => {
    setState((p) =>
      normalizeStep1ForService({
        ...p,
        selectedCategory: "regular",
        service_group: "regular",
        service_type: "standard_cleaning",
        service: bookingServiceIdFromType("standard_cleaning"),
      }),
    );
  }, [setState]);

  const pickRegularType = useCallback(
    (t: "standard_cleaning" | "airbnb_cleaning") => {
      setState((p) =>
        normalizeStep1ForService({
          ...p,
          selectedCategory: "regular",
          service_group: "regular",
          service_type: t,
          service: bookingServiceIdFromType(t),
        }),
      );
    },
    [setState],
  );

  const pickSpecialisedGroup = useCallback(() => {
    setState((p) => ({
      ...p,
      selectedCategory: "specialised",
      service_group: "specialised",
      service_type: null,
      service: null,
    }));
  }, [setState]);

  const pickSpecialisedType = useCallback(
    (t: "deep_cleaning" | "move_cleaning" | "carpet_cleaning") => {
      setState((p) =>
        normalizeStep1ForService({
          ...p,
          selectedCategory: "specialised",
          service_group: "specialised",
          service_type: t,
          service: bookingServiceIdFromType(t),
        }),
      );
    },
    [setState],
  );

  const isRegularGroup = state.service_group === "regular";
  const isSpecialisedGroup = state.service_group === "specialised";
  const st = state.service_type;

  const hasRegularType = st === "standard_cleaning" || st === "airbnb_cleaning";
  const hasSpecialisedType =
    st === "deep_cleaning" || st === "move_cleaning" || st === "carpet_cleaning";

  const canContinue = Boolean(state.service && state.service_type && (hasRegularType || hasSpecialisedType));

  const hoursLabel =
    estimate.hours % 1 === 0 ? `${estimate.hours}` : estimate.hours.toFixed(1).replace(/\.0$/, "");

  const durationServiceLine = state.service
    ? `≈ ${hoursLabel} hours · ${getBookingSummaryServiceLabel(state.service, state.service_type)}`
    : isSpecialisedGroup
      ? "Pick an option below — your total updates when you choose"
      : "Choose a cleaning type below to see timing";

  return (
    <BookingLayout
      useFlowHeader
      summaryState={state}
      showPricePreview={false}
      stepLabel="Step 2 of 5"
      canContinue={canContinue}
      onContinue={() => router.push(bookingFlowHref("details"))}
      continueLabel={copy.cta}
      stickyMobileBar={{
        totalZar: estimate.total,
        subline: copy.supporting,
        totalCaption: copy.priceLabel,
      }}
      footerTotalZar={estimate.total}
    >
      <div className="mx-auto max-w-xl space-y-8 pb-6 lg:mx-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {copy.title}
          </h1>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-md dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {copy.priceLabel}
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            R {estimate.total.toLocaleString("en-ZA")}
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{durationServiceLine}</p>
          <p className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{copy.earlyTrust}</p>
          <p className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">{copy.trust}</p>
          <p className="mt-3 text-sm font-semibold text-amber-900 dark:text-amber-200/90">{copy.urgency}</p>
        </div>

        <section className="space-y-3" aria-labelledby="cleaning-type-heading">
          <h2 id="cleaning-type-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Choose your cleaning type
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <GroupCard
              title="Regular Cleaning"
              description="Perfect for weekly or general home cleaning"
              selected={isRegularGroup}
              onSelect={pickRegularGroup}
            />
            <GroupCard
              title="Specialised Cleaning"
              description="For deep, moving or specialised cleaning needs"
              selected={isSpecialisedGroup}
              onSelect={pickSpecialisedGroup}
            />
          </div>

          {isRegularGroup ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Choose a standard home cleaning option</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <MiniOption
                  label="Standard Cleaning"
                  description="Weekly or general home clean"
                  selected={st === "standard_cleaning"}
                  onSelect={() => pickRegularType("standard_cleaning")}
                />
                <MiniOption
                  label="Airbnb Cleaning"
                  description="Guest-ready turnovers"
                  selected={st === "airbnb_cleaning"}
                  onSelect={() => pickRegularType("airbnb_cleaning")}
                />
              </div>
            </div>
          ) : null}

          {isSpecialisedGroup ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">For deep, moving or specialised cleaning needs</p>
              {!hasSpecialisedType ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Preview is a guide — tap the option that matches your visit to lock your total.
                </p>
              ) : null}
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Pick one:</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <MiniOption
                  label="Deep Cleaning"
                  description="Intensive, high-traffic homes"
                  selected={st === "deep_cleaning"}
                  onSelect={() => pickSpecialisedType("deep_cleaning")}
                />
                <MiniOption
                  label="Move In/Out Cleaning"
                  description="Empty-home handover clean"
                  selected={st === "move_cleaning"}
                  onSelect={() => pickSpecialisedType("move_cleaning")}
                />
                <MiniOption
                  label="Carpet Cleaning"
                  description="Rugs and carpeted areas"
                  selected={st === "carpet_cleaning"}
                  onSelect={() => pickSpecialisedType("carpet_cleaning")}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/30">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">What&apos;s included</h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{copy.supporting}</p>
        </section>

        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{copy.reassurance}</p>
      </div>
    </BookingLayout>
  );
}
