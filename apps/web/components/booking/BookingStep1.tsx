"use client";

import { CategoryPicker } from "./CategoryPicker";
import { ExtrasSection } from "./ExtrasSection";
import { HomeDetails } from "./HomeDetails";
import { ServiceSelection } from "./ServiceSelection";
import { SectionCard } from "./SectionCard";
import { SmartRetentionBanner } from "./SmartRetentionBanner";
import { SmartExtraSuggestions } from "./SmartExtraSuggestions";
import { useBookingVipTier } from "./useBookingVipTier";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { useIsBookingLocked } from "./useLockedBooking";
import type { UseBookingStep1Return } from "./useBookingStep1";

export type { BookingStep1State } from "./useBookingStep1";
export { BOOKING_STEP1_STORAGE_KEY } from "./useBookingStep1";
export type { BookingServiceId } from "./serviceCategories";

type BookingStep1Props = {
  booking: UseBookingStep1Return;
};

export function BookingStep1({ booking }: BookingStep1Props) {
  const {
    state,
    setState,
    selectedCategory,
    setSelectedCategory,
    categoryServices,
    maxRooms,
    blockedExtras,
    reset,
    mainTransitionKey,
  } = booking;

  const { tier: vipTier } = useBookingVipTier();
  const pastHints = usePastBookingHints();

  const isLocked = useIsBookingLocked();

  return (
    <div className="pb-4">
      {isLocked ? (
        <div
          className="mb-4 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
          role="status"
        >
          Your quote and time slot are <strong>locked</strong> for checkout. Use{" "}
          <strong>Reset</strong> to clear the booking and edit again.
        </div>
      ) : null}

      {!isLocked ? <SmartRetentionBanner /> : null}

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            What do you need cleaned?
          </h1>
          <p className="mt-2 max-w-[576px] text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Select your service and home details.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
          {selectedCategory && !isLocked ? (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="rounded-full border border-zinc-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            >
              ← Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-zinc-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          >
            Reset
          </button>
        </div>
      </div>

      <fieldset
        disabled={isLocked}
        className="min-w-0 border-0 p-0 disabled:pointer-events-none disabled:opacity-[0.55]"
      >
      {!selectedCategory ? (
        <div className="space-y-6 transition-opacity duration-300 ease-out motion-reduce:transition-none">
          <CategoryPicker onSelect={(id) => setSelectedCategory(id)} />
        </div>
      ) : (
        <div
          key={mainTransitionKey}
          className="space-y-5 transition-opacity duration-300 ease-out motion-reduce:transition-none"
        >
          <SectionCard
            title="Service"
            description="Choose the clean that fits your space."
          >
            <ServiceSelection
              services={categoryServices}
              state={state}
              setState={setState}
            />
          </SectionCard>
          <SectionCard
            title="Home details"
            description="Helps your team arrive prepared."
          >
            <HomeDetails state={state} maxRooms={maxRooms} setState={setState} />
          </SectionCard>
          <SectionCard
            title="Extras"
            description="Add only what you need — you can adjust anytime before you book."
          >
            <ExtrasSection
              state={state}
              blockedExtras={blockedExtras}
              setState={setState}
            />
          </SectionCard>
          {state.service ? (
            <SmartExtraSuggestions
              state={state}
              setState={setState}
              blockedExtras={blockedExtras}
              userTier={vipTier}
              pastHints={pastHints}
            />
          ) : null}
        </div>
      )}
      </fieldset>
    </div>
  );
}
