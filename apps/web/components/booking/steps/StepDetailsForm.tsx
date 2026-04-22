"use client";

import Link from "next/link";
import { lazy, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import BookingLayout from "@/components/booking/BookingLayout";
import { SectionCard } from "@/components/booking/SectionCard";
import { HomeDetails } from "@/components/booking/HomeDetails";
import { SmartExtraSuggestions } from "@/components/booking/SmartExtraSuggestions";
import { SmartRetentionBanner } from "@/components/booking/SmartRetentionBanner";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { useIsBookingLocked } from "@/components/booking/useLockedBooking";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { calculatePrice } from "@/lib/pricing/calculatePrice";
import { writeBookingPricePreviewLock } from "@/lib/booking/bookingPricePreview";
import { bookingServiceIdFromType, normalizeStep1ForService } from "@/components/booking/serviceCategories";

const ExtrasSection = lazy(() =>
  import("@/components/booking/ExtrasSection").then((m) => ({ default: m.ExtrasSection })),
);

export function StepDetailsForm() {
  const router = useRouter();
  const copy = bookingCopy.details;
  const booking = useBookingStep1();
  const { state, setState, maxRooms, blockedExtras, canContinue } = booking;

  const { tier: vipTier } = useBookingVipTier();
  const pastHints = usePastBookingHints();
  const isLocked = useIsBookingLocked();

  const live = useMemo(
    () =>
      calculatePrice({
        service: state.service,
        serviceType: state.service_type,
        rooms: state.rooms,
        bathrooms: state.bathrooms,
        extraRooms: state.extraRooms,
        extras: state.extras,
      }),
    [state.bathrooms, state.extraRooms, state.extras, state.rooms, state.service, state.service_type],
  );

  const persistPreview = () => {
    if (!state.service) return;
    writeBookingPricePreviewLock({
      finalPrice: live.total,
      surgeMultiplier: 1,
      lockedAt: new Date().toISOString(),
      estimatedHours: live.hours,
      service: state.service,
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
    });
  };

  const goWhen = () => {
    if (!canContinue) return;
    persistPreview();
    router.push(bookingFlowHref("when"));
  };

  const regularStandardSelected =
    state.service_group === "regular" &&
    (state.service_type === "standard_cleaning" || state.service === "standard" || state.service === "quick");

  const regularAirbnbSelected =
    state.service_group === "regular" && (state.service_type === "airbnb_cleaning" || state.service === "airbnb");

  const setRegularCleanType = (t: "standard_cleaning" | "airbnb_cleaning") => {
    setState((p) =>
      normalizeStep1ForService({
        ...p,
        selectedCategory: "regular",
        service_group: "regular",
        service_type: t,
        service: bookingServiceIdFromType(t),
      }),
    );
  };

  const specialisedDeepSelected =
    state.service_group === "specialised" && (state.service_type === "deep_cleaning" || state.service === "deep");
  const specialisedMoveSelected =
    state.service_group === "specialised" && (state.service_type === "move_cleaning" || state.service === "move");
  const specialisedCarpetSelected =
    state.service_group === "specialised" && (state.service_type === "carpet_cleaning" || state.service === "carpet");

  const setSpecialisedType = (t: "deep_cleaning" | "move_cleaning" | "carpet_cleaning") => {
    setState((p) =>
      normalizeStep1ForService({
        ...p,
        selectedCategory: "specialised",
        service_group: "specialised",
        service_type: t,
        service: bookingServiceIdFromType(t),
      }),
    );
  };

  return (
    <BookingLayout
      useFlowHeader
      summaryState={state}
      showPricePreview
      stepLabel="Step 3 of 5"
      canContinue={canContinue}
      onContinue={goWhen}
      continueLabel={copy.cta}
      stickyMobileBar={{ totalZar: live.total, subline: copy.reassurance, totalCaption: bookingCopy.stickyBar.total }}
      footerTotalZar={live.total}
    >
      <div className="space-y-6 pb-6">
        {isLocked ? (
          <div
            className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            This booking is locked for checkout. Use <strong>Reset</strong> in the menu to edit again.
          </div>
        ) : null}

        {!isLocked ? <SmartRetentionBanner /> : null}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
        </div>

        <fieldset
          disabled={isLocked}
          className="min-w-0 space-y-5 border-0 p-0 disabled:pointer-events-none disabled:opacity-[0.55]"
        >
          <SectionCard title={copy.cleanTypeTitle} description={copy.cleanTypeHint}>
            {!state.service ? (
              <p className="text-sm text-amber-800 dark:text-amber-300/95">
                <Link
                  href={bookingFlowHref("quote")}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Go back to your price
                </Link>{" "}
                to choose a cleaning type.
              </p>
            ) : state.service_group === "specialised" ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  For deep, moving or specialised cleaning needs — switch anytime.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSpecialisedType("deep_cleaning")}
                    className={[
                      "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      specialisedDeepSelected
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    Deep Cleaning
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpecialisedType("move_cleaning")}
                    className={[
                      "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      specialisedMoveSelected
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    Move In/Out
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpecialisedType("carpet_cleaning")}
                    className={[
                      "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      specialisedCarpetSelected
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    Carpet Cleaning
                  </button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <Link href={bookingFlowHref("quote")} className="font-semibold text-primary underline-offset-4 hover:underline">
                    Back to price step
                  </Link>{" "}
                  to change regular vs specialised.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Choose a standard home cleaning option — your total updates right away.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRegularCleanType("standard_cleaning")}
                    className={[
                      "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      regularStandardSelected
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    Standard Cleaning
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegularCleanType("airbnb_cleaning")}
                    className={[
                      "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                      regularAirbnbSelected
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    Airbnb Cleaning
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title={copy.homeDetailsTitle} description={copy.homeDetailsHint}>
            <HomeDetails state={state} maxRooms={maxRooms} setState={setState} omitLocation />
          </SectionCard>

          <Suspense
            fallback={
              <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Loading extras…
              </div>
            }
          >
            <SectionCard title={copy.extrasTitle} description={copy.reassurance}>
              <ExtrasSection state={state} blockedExtras={blockedExtras} setState={setState} />
            </SectionCard>
          </Suspense>

          {state.service ? (
            <SmartExtraSuggestions
              state={state}
              setState={setState}
              blockedExtras={blockedExtras}
              userTier={vipTier}
              pastHints={pastHints}
            />
          ) : null}
        </fieldset>
      </div>
    </BookingLayout>
  );
}
