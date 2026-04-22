"use client";

import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import {
  buildAssistantSlots,
  getCheapSlotSavingsMessage,
  getPremiumTimeUpsellExtras,
  getSmartRecommendations,
  type BookingContext,
} from "@/lib/ai/bookingAssistant";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { trackAssistantEvent } from "@/lib/booking/trackAssistantEvent";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import {
  BOOKING_CALENDAR_DAYS,
  BookingDateSelector,
  generateNextDates,
} from "@/components/booking/BookingDateStrip";
import { SectionCard } from "@/components/booking/SectionCard";
import { TimeSlotCard } from "@/components/booking/TimeSlotCard";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { computeSlotLabels } from "@/lib/booking/slotLabels";
import { clearLockedBookingFromStorage, lockedToStep1State, lockBookingSlot } from "@/lib/booking/lockedBooking";
import { calculatePrice, calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import type { VipTier } from "@/lib/pricing/vipTier";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";

const MORNING = ["08:00", "09:00", "10:00", "11:00"] as const;
const AFTERNOON = ["12:00", "13:00", "14:00", "15:00", "16:00"] as const;
const ALL_SLOT_TIMES = [...MORNING, ...AFTERNOON] as const;

const AFTERNOON_INITIAL = 4;

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function formatDurationLine(hours: number): string {
  const h = hours % 1 === 0 ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return `≈ ${h} hrs`;
}

function useSlotFinalPrices(state: BookingStep1State | null, tier: VipTier) {
  return useMemo(() => {
    if (!state) return null;
    const { total: baseTotal, hours } = calculatePrice({
      service: state.service,
      serviceType: state.service_type,
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
    });
    const byTime: Record<string, number> = {};
    for (const t of ALL_SLOT_TIMES) {
      byTime[t] = calculateSmartQuote(
        {
          service: state.service,
          serviceType: state.service_type,
          rooms: state.rooms,
          bathrooms: state.bathrooms,
          extraRooms: state.extraRooms,
          extras: state.extras,
        },
        t,
        tier,
      ).total;
    }
    return { baseTotal, hours, byTime };
  }, [state, tier]);
}

function AfternoonSlotSection({ renderSlot }: { renderSlot: (time: string) => ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? [...AFTERNOON] : AFTERNOON.slice(0, AFTERNOON_INITIAL);
  const hasMore = AFTERNOON.length > AFTERNOON_INITIAL;

  return (
    <section className="space-y-3" aria-labelledby="afternoon-heading">
      <div>
        <h2 id="afternoon-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {bookingCopy.when.afternoonHeading}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{bookingCopy.when.afternoonHint}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((time) => renderSlot(time))}
      </div>
      {hasMore && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-semibold text-zinc-700 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-zinc-600 dark:text-zinc-200 dark:hover:border-primary/60 dark:hover:bg-primary/10"
        >
          Show more times
        </button>
      ) : null}
    </section>
  );
}

type StepScheduleProps = {
  onNext: () => void;
  onBack: () => void;
};

function tomorrowYmd(allDateValues: string[]): string | null {
  return allDateValues.length > 1 ? allDateValues[1]! : null;
}

export function StepSchedule({ onNext, onBack }: StepScheduleProps) {
  const step1 = usePersistedBookingSummaryState();
  const locked = useLockedBooking();
  const { tier: vipTier } = useBookingVipTier();
  const pastHints = usePastBookingHints();
  const summaryState = step1 ?? (locked ? lockedToStep1State(locked) : null);
  const lockBaseState = step1 ?? (locked ? lockedToStep1State(locked) : null);

  const allDateValues = useMemo(
    () => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value),
    [],
  );
  const lockedDateInRange =
    locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const slotPrices = useSlotFinalPrices(lockBaseState, vipTier);

  const bookingContext = useMemo((): BookingContext | null => {
    if (!lockBaseState) return null;
    return {
      service: lockBaseState.service ?? "",
      rooms: lockBaseState.rooms,
      bathrooms: lockBaseState.bathrooms,
      extras: lockBaseState.extras,
      userTier: vipTier,
      pastBookings: pastHints,
    };
  }, [lockBaseState, vipTier, pastHints]);

  const assistantSlots = useMemo(() => {
    if (!slotPrices) return [];
    return buildAssistantSlots(ALL_SLOT_TIMES, slotPrices.byTime);
  }, [slotPrices]);

  const recommendations = useMemo(() => {
    if (!bookingContext || assistantSlots.length === 0) return null;
    return getSmartRecommendations(bookingContext, assistantSlots);
  }, [bookingContext, assistantSlots]);

  const slotLabels = useMemo(() => {
    if (!slotPrices) return null;
    return computeSlotLabels(ALL_SLOT_TIMES, slotPrices.byTime);
  }, [slotPrices]);

  const maxSlotPrice = useMemo(() => {
    if (!slotPrices) return 0;
    return Math.max(...ALL_SLOT_TIMES.map((t) => slotPrices.byTime[t] ?? 0));
  }, [slotPrices]);

  const durationLine = useMemo(() => {
    if (!slotPrices) return "";
    return formatDurationLine(slotPrices.hours);
  }, [slotPrices]);

  const canContinue = locked != null;

  const urgencyLine = useMemo(() => {
    const t = tomorrowYmd(allDateValues);
    if (!t || selectedDate !== t) return null;
    return bookingCopy.when.urgency;
  }, [allDateValues, selectedDate]);

  function handleSelectSlot(time: string) {
    if (!lockBaseState) return;
    trackAssistantEvent("slot_selected", { time, date: selectedDate });
    lockBookingSlot(lockBaseState, { date: selectedDate, time }, { vipTier });
  }

  const selectedTime = useMemo(
    () => (locked && locked.date === selectedDate ? locked.time : null),
    [locked, selectedDate],
  );
  const dimOtherSlots = selectedTime !== null;

  const premiumUpsell =
    bookingContext && selectedTime
      ? getPremiumTimeUpsellExtras(bookingContext).filter((x) => !bookingContext.extras.includes(x.id))
      : [];

  const demandForSelected =
    selectedTime != null ? assistantSlots.find((s) => s.time === selectedTime)?.demand : undefined;

  const locationLine = step1?.location?.trim() ?? "";
  const locationDisplay = locationLine ? truncateText(locationLine, 48) : "";

  const continueLabel = locked ? bookingCopy.when.cta : "Select a time";

  const stickyBar = useMemo(() => {
    if (!slotPrices) return undefined;
    const totalZar = locked
      ? (slotPrices.byTime[locked.time] ?? slotPrices.baseTotal)
      : slotPrices.baseTotal;
    return {
      totalZar,
      subline: durationLine || undefined,
      ctaUrgency: locked
        ? bookingCopy.stickyBar.urgencyCleanerAvailable
        : bookingCopy.stickyBar.urgencySlotsFilling,
    };
  }, [durationLine, locked, slotPrices]);

  const lockBannerVisible =
    Boolean(locked && locked.date === selectedDate && selectedTime);

  function slotCardProps(time: string) {
    if (!slotPrices) return null;
    const priceZar = slotPrices.byTime[time]!;
    const savings = maxSlotPrice > priceZar ? maxSlotPrice - priceZar : 0;
    const demand = assistantSlots.find((s) => s.time === time)?.demand;
    return {
      time,
      priceZar,
      compareAtZar: savings > 0 ? maxSlotPrice : null,
      savingsZar: savings > 0 ? savings : null,
      durationLabel: durationLine,
      slotLabel: slotLabels?.[time] ?? null,
      selected: selectedTime === time,
      dimUnselected: dimOtherSlots,
      onSelect: () => handleSelectSlot(time),
      assistantRecommended: recommendations ? time === recommendations.recommended.time : false,
      recommendedBadgeText: bookingCopy.when.recommended,
      showMostPopularBadge: slotLabels?.[time] === "most-booked",
      showFillsFastBadge: demand === "high",
    };
  }

  const bestValueSaveMessage =
    locked &&
    recommendations &&
    locked.date === selectedDate &&
    locked.time === recommendations.bestValue.time &&
    slotPrices
      ? getCheapSlotSavingsMessage(slotPrices.byTime[locked.time] ?? 0, maxSlotPrice)
      : null;

  return (
    <BookingLayout
      useFlowHeader
      summaryState={summaryState ?? undefined}
      showPricePreview
      suppressEstimateUntilLocked
      stepLabel="Step 4 of 5"
      canContinue={canContinue}
      onContinue={onNext}
      continueLabel={continueLabel}
      stickyMobileBar={stickyBar}
      footerTotalZar={stickyBar?.totalZar}
      footerSubcopy={
        !locked ? <p className="text-center">{bookingCopy.errors.time}</p> : undefined
      }
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {bookingCopy.when.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {bookingCopy.when.intro}
          </p>
          {recommendations?.personalizationNote ? (
            <p
              className="mt-3 max-w-2xl rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm font-medium text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-50"
              role="status"
            >
              {recommendations.personalizationNote}
            </p>
          ) : null}
          {urgencyLine ? (
            <p
              className="mt-3 max-w-2xl rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-2.5 text-sm font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50"
              role="status"
            >
              {urgencyLine}
            </p>
          ) : null}
        </div>

        {!lockBaseState ? (
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            No saved booking yet.{" "}
            <Link
              href={bookingFlowHref("entry")}
              className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Start your booking
            </Link>
          </p>
        ) : (
          <>
            <SectionCard
              title="Location"
              description="Where should we send the cleaner?"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800/80">
                    <MapPin className="h-5 w-5 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {locationDisplay || "No location selected"}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      Tap edit to change your details
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearLockedBookingFromStorage();
                    onBack();
                  }}
                  className="shrink-0 text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                >
                  Edit
                </button>
              </div>
            </SectionCard>

            <section className="space-y-3" aria-labelledby="date-heading">
              <h2 id="date-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {bookingCopy.when.dateHeading}
              </h2>
              <BookingDateSelector
                selected={selectedDate}
                onSelect={(ymd) => setDateOverride(ymd)}
              />
            </section>

            {slotPrices && slotLabels ? (
              <>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {bookingCopy.when.availability}
                </p>
                <section className="space-y-3" aria-labelledby="morning-heading">
                  <div>
                    <h2 id="morning-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {bookingCopy.when.morningHeading}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{bookingCopy.when.morningHint}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {MORNING.map((time) => {
                      const p = slotCardProps(time);
                      return p ? <TimeSlotCard key={time} {...p} /> : null;
                    })}
                  </div>
                </section>

                <AfternoonSlotSection
                  key={selectedDate}
                  renderSlot={(time) => {
                    const p = slotCardProps(time);
                    return p ? <TimeSlotCard key={time} {...p} /> : null;
                  }}
                />

                {bestValueSaveMessage ? (
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300" role="status">
                    {bestValueSaveMessage}
                  </p>
                ) : null}

                {demandForSelected === "high" && premiumUpsell.length > 0 ? (
                  <div className="rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-sm text-violet-950 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/35 dark:text-violet-50">
                    <p className="font-semibold">Premium time</p>
                    <p className="mt-1 text-xs leading-relaxed text-violet-900/90 dark:text-violet-100/90">
                      {premiumUpsell[0]?.reason} Add{" "}
                      <span className="font-medium">{premiumUpsell[0]?.label}</span> (+R
                      {premiumUpsell[0]?.price.toLocaleString("en-ZA")}) on{" "}
                      <Link
                        href={bookingFlowHref("details")}
                        className="font-semibold text-violet-800 underline-offset-2 hover:underline dark:text-violet-200"
                      >
                        home details
                      </Link>
                      .
                    </p>
                  </div>
                ) : null}

                {lockBannerVisible ? (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-950 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-50"
                    role="status"
                  >
                    <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                    <span>Price locked for this time</span>
                  </div>
                ) : null}
              </>
            ) : null}

            <p className="text-xs text-zinc-500 dark:text-zinc-400" role="status">
              {locked
                ? "Change the time above if you need to — your summary stays in sync."
                : "Tap a slot to lock this visit — your summary updates right away."}
            </p>
          </>
        )}
      </div>
    </BookingLayout>
  );
}
