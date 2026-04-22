"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import BookingLayout from "@/components/booking/BookingLayout";
import { SectionCard } from "@/components/booking/SectionCard";
import { HomeDetails } from "@/components/booking/HomeDetails";
import { SmartExtraSuggestions } from "@/components/booking/SmartExtraSuggestions";
import { SmartRetentionBanner } from "@/components/booking/SmartRetentionBanner";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { bookingServiceIdFromType, normalizeStep1ForService } from "@/components/booking/serviceCategories";
import { estimateFromSmartQuoteMin } from "@/lib/booking/smartQuoteEstimate";
import { clearLockedBookingFromStorage, getLockedBookingDisplayPrice } from "@/lib/booking/lockedBooking";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";

const ExtrasSection = lazy(() =>
  import("@/components/booking/ExtrasSection").then((m) => ({ default: m.ExtrasSection })),
);

export function StepDetailsForm() {
  const router = useRouter();
  const copy = bookingCopy.details;
  const { handleResetBooking } = useBookingFlow();
  const booking = useBookingStep1();
  const { state, setState, maxRooms, blockedExtras, canContinue } = booking;

  const { tier: vipTier } = useBookingVipTier();
  const pastHints = usePastBookingHints();
  const locked = useLockedBooking();
  const isLocked = locked != null;
  const skipLockClearOnMount = useRef(true);

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

  const estimateFrom = useMemo(() => estimateFromSmartQuoteMin(state, vipTier), [state, vipTier]);

  const goWhen = () => {
    if (!canContinue) return;
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

  const lockedVisitZar = locked ? getLockedBookingDisplayPrice(locked) : null;

  return (
    <BookingLayout
      summaryState={state}
      canContinue={canContinue}
      onContinue={goWhen}
      continueLabel={copy.cta}
      stickyMobileBar={
        isLocked && lockedVisitZar != null
          ? {
              totalZar: lockedVisitZar,
              totalCaption: "Locked visit price",
              subline: "Reset booking to edit your details, or continue to schedule / pay",
              ctaShort: copy.cta,
            }
          : !isLocked && estimateFrom != null
            ? {
                totalZar: estimateFrom,
                totalCaption: "Estimated from",
                subline: "Slot prices in the next step are the real totals",
                ctaShort: copy.cta,
              }
            : undefined
      }
      footerTotalZar={
        isLocked && lockedVisitZar != null ? lockedVisitZar : !isLocked && estimateFrom != null ? estimateFrom : undefined
      }
    >
      <div className="space-y-6 pb-6">
        {isLocked ? (
          <div
            className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            <span>This booking is locked for checkout.</span>{" "}
            <button
              type="button"
              onClick={handleResetBooking}
              className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Reset booking
            </button>
          </div>
        ) : null}

        {!isLocked ? <SmartRetentionBanner /> : null}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          {!isLocked && estimateFrom != null ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-300/90 bg-zinc-50/90 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-900/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Estimated price
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                From R {estimateFrom.toLocaleString("en-ZA")}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Final amount is shown on each time slot when you schedule.
              </p>
            </div>
          ) : null}
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

          <SectionCard title="Choose cleaning frequency" description="Most popular: Weekly cleaning">
            <div className="space-y-2">
              {(
                [
                  ["one_time", "One-time", "No recurring plan"],
                  ["weekly", "Weekly (save 10%)", "Most popular"],
                  ["biweekly", "Every 2 weeks (save 5%)", "Great value"],
                  ["monthly", "Monthly", "Low-maintenance"],
                ] as const
              ).map(([id, label, hint]) => {
                const active = state.cleaningFrequency === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setState((p) => ({ ...p, cleaningFrequency: id }))}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition-all",
                      active
                        ? "border-primary bg-primary/10 text-zinc-900 dark:text-zinc-50"
                        : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    <p className="font-semibold">{label}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
                  </button>
                );
              })}
              {recurringDiscountPct > 0 ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {state.cleaningFrequency === "weekly"
                    ? "Weekly plan: 10% off each visit — applied at checkout after your time is locked."
                    : "Every 2 weeks: 5% off each visit — applied at checkout after your time is locked."}
                </p>
              ) : null}
            </div>
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
