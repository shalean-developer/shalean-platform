"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { getPremiumTimeUpsellExtras, getSmartRecommendations, type BookingContext } from "@/lib/ai/bookingAssistant";
import { usePastBookingHints } from "@/lib/booking/usePastBookingHints";
import { trackAssistantEvent } from "@/lib/booking/trackAssistantEvent";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
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
import { TimeSlotCard, type SlotDemandPriceBand } from "@/components/booking/TimeSlotCard";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import {
  clearLockedBookingFromStorage,
  getLockedBookingDisplayPrice,
  lockedToStep1State,
  lockBookingSlot,
} from "@/lib/booking/lockedBooking";
import { calculatePrice } from "@/lib/pricing/calculatePrice";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";

type LiveSlot = {
  time: string;
  available: boolean;
  cleanersCount: number;
  price?: number;
  duration?: number;
  surgeMultiplier?: number;
  surgeApplied?: boolean;
};

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

function formatDurationNumber(hours: number): string {
  return hours % 1 === 0 ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
}

function slotDemandPriceBand(price: number | null, avg: number | null): SlotDemandPriceBand | null {
  if (price == null || avg == null || !Number.isFinite(price) || !Number.isFinite(avg) || avg <= 0) {
    return null;
  }
  if (price < avg) return "best-value";
  if (price > avg) return "peak";
  return "standard";
}

function AfternoonSlotSection({
  times,
  renderSlot,
}: {
  times: string[];
  renderSlot: (time: string) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? [...times] : times.slice(0, AFTERNOON_INITIAL);
  const hasMore = times.length > AFTERNOON_INITIAL;

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
  const [liveSlots, setLiveSlots] = useState<LiveSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const allDateValues = useMemo(
    () => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value),
    [],
  );
  const lockedDateInRange =
    locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const allSlotTimes = useMemo(() => liveSlots.filter((s) => s.available).map((s) => s.time), [liveSlots]);

  const slotPriceByTime = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of liveSlots) {
      if (s.available && typeof s.price === "number" && Number.isFinite(s.price)) {
        m[s.time] = s.price;
      }
    }
    return m;
  }, [liveSlots]);

  const maxSlotPrice = useMemo(() => {
    const vals = Object.values(slotPriceByTime);
    if (vals.length === 0) return 0;
    return Math.max(...vals);
  }, [slotPriceByTime]);

  const averageSlotPrice = useMemo(() => {
    const vals = Object.values(slotPriceByTime);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [slotPriceByTime]);

  const durationLine = useMemo(() => {
    const durs = liveSlots
      .filter((s) => s.available && typeof s.duration === "number" && Number.isFinite(s.duration))
      .map((s) => s.duration!);
    if (durs.length > 0) {
      const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
      return formatDurationLine(avg);
    }
    if (!lockBaseState) return "";
    const { hours } = calculatePrice({
      service: lockBaseState.service,
      serviceType: lockBaseState.service_type,
      rooms: lockBaseState.rooms,
      bathrooms: lockBaseState.bathrooms,
      extraRooms: lockBaseState.extraRooms,
      extras: lockBaseState.extras,
    });
    return formatDurationLine(hours);
  }, [liveSlots, lockBaseState]);

  useEffect(() => {
    if (!lockBaseState) return;
    let active = true;
    void (async () => {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const estimate = calculatePrice({
          service: lockBaseState.service,
          serviceType: lockBaseState.service_type,
          rooms: lockBaseState.rooms,
          bathrooms: lockBaseState.bathrooms,
          extraRooms: lockBaseState.extraRooms,
          extras: lockBaseState.extras,
        });
        const params = new URLSearchParams();
        params.set("date", selectedDate);
        params.set("duration", String(Math.round(estimate.hours * 60)));
        const svc = lockBaseState.service_type ?? lockBaseState.service;
        if (svc) params.set("serviceType", String(svc));
        params.set("bedrooms", String(Math.max(1, lockBaseState.rooms)));
        params.set("bathrooms", String(Math.max(1, lockBaseState.bathrooms)));
        const res = await fetch(`/api/booking/time-slots?${params.toString()}`);
        const json = (await res.json()) as { slots?: LiveSlot[]; error?: string };
        if (!active) return;
        if (!res.ok) {
          setSlotsError(json.error ?? "Failed to load time slots.");
          setLiveSlots([]);
          return;
        }
        const slots = json.slots ?? [];
        setLiveSlots(slots);
        trackAssistantEvent("times_loaded", {
          selectedDate,
          slotsCount: slots.filter((s) => s.available).length,
          cleanersCount: slots.reduce((sum, s) => sum + (s.cleanersCount ?? 0), 0),
        });
        trackGrowthEvent("times_loaded", {
          selectedDate,
          slotsCount: slots.filter((s) => s.available).length,
        });
      } catch {
        if (!active) return;
        setSlotsError("Failed to load time slots.");
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [lockBaseState, selectedDate]);

  /** Deep-link from checkout: `#booking-time-slots` scrolls after slots load. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#booking-time-slots") return;
    if (slotsLoading) return;
    const el = document.getElementById("booking-time-slots");
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [slotsLoading, selectedDate, allSlotTimes.length]);

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
    return allSlotTimes.map((time) => {
      const cleanersCount = liveSlots.find((s) => s.time === time)?.cleanersCount ?? 0;
      return {
        time,
        price: slotPriceByTime[time] ?? maxSlotPrice,
        demand: cleanersCount <= 1 ? ("high" as const) : cleanersCount <= 3 ? ("normal" as const) : ("low" as const),
      };
    });
  }, [allSlotTimes, liveSlots, maxSlotPrice, slotPriceByTime]);

  const recommendations = useMemo(() => {
    if (!bookingContext || assistantSlots.length === 0) return null;
    return getSmartRecommendations(bookingContext, assistantSlots);
  }, [bookingContext, assistantSlots]);

  const canContinue = locked != null;

  const urgencyLine = useMemo(() => {
    const t = tomorrowYmd(allDateValues);
    if (!t || selectedDate !== t) return null;
    return bookingCopy.when.urgency;
  }, [allDateValues, selectedDate]);

  async function handleSelectSlot(time: string) {
    if (!lockBaseState) return;
    const slot = liveSlots.find((s) => s.time === time);
    if (!slot) return;
    if (
      typeof slot.price === "number" &&
      Number.isFinite(slot.price) &&
      typeof slot.duration === "number" &&
      Number.isFinite(slot.duration)
    ) {
      trackAssistantEvent("slot_selected", { time, date: selectedDate });
      lockBookingSlot(lockBaseState, { date: selectedDate, time }, {
        vipTier,
        lockedQuote: {
          total: slot.price,
          hours: slot.duration,
          surge: Number(slot.surgeMultiplier ?? 1),
          surgeLabel: slot.surgeApplied ? "High demand" : "Standard",
          cleanersCount: slot.cleanersCount,
        },
      });
      return;
    }
    const res = await fetch("/api/booking/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType: lockBaseState.service_type ?? lockBaseState.service,
        bedrooms: lockBaseState.rooms,
        bathrooms: lockBaseState.bathrooms,
        date: selectedDate,
        time,
        cleanersCount: slot.cleanersCount,
      }),
    });
    const json = (await res.json()) as {
      price?: number;
      duration?: number;
      surgeMultiplier?: number;
      surgeApplied?: boolean;
      error?: string;
    };
    if (!res.ok || typeof json.price !== "number" || typeof json.duration !== "number") return;
    trackAssistantEvent("price_calculated", {
      selectedTime: time,
      price: json.price,
      cleanersCount: slot.cleanersCount,
    });
    trackGrowthEvent("price_calculated", {
      selectedTime: time,
      price: json.price,
      cleanersCount: slot.cleanersCount,
    });
    trackAssistantEvent("slot_selected", { time, date: selectedDate });
    lockBookingSlot(lockBaseState, { date: selectedDate, time }, {
      vipTier,
      lockedQuote: {
        total: json.price,
        hours: json.duration,
        surge: Number(json.surgeMultiplier ?? 1),
        surgeLabel: json.surgeApplied ? "High demand" : "Standard",
        cleanersCount: slot.cleanersCount,
      },
    });
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
  const selectedQuote =
    locked && selectedTime
      ? {
          total: getLockedBookingDisplayPrice(locked),
          surge: locked.surge > 0 ? locked.surge : 1,
          surgeLabel: locked.surgeLabel ?? "Standard",
          hours: locked.finalHours,
        }
      : null;

  const locationLine = step1?.location?.trim() ?? "";
  const locationDisplay = locationLine ? truncateText(locationLine, 48) : "";

  const continueLabel = locked ? bookingCopy.when.cta : "Select a time";

  const stickyBar = useMemo(() => {
    if (!lockBaseState) return undefined;
    if (locked) {
      const totalZar = getLockedBookingDisplayPrice(locked);
      const sub =
        locked.finalHours % 1 === 0
          ? String(locked.finalHours)
          : locked.finalHours.toFixed(1).replace(/\.0$/, "");
      return {
        totalZar,
        subline: `≈ ${sub} hrs`,
        ctaUrgency: bookingCopy.stickyBar.urgencyCleanerAvailable,
      };
    }
    return {
      totalZar: 0,
      amountDisplayOverride: "Select a time",
      subline: durationLine || undefined,
      ctaUrgency: bookingCopy.stickyBar.urgencySlotsFilling,
    };
  }, [durationLine, lockBaseState, locked]);

  const lockBannerVisible =
    Boolean(locked && locked.date === selectedDate && selectedTime);

  function slotCardProps(time: string) {
    const slot = liveSlots.find((s) => s.time === time);
    const priceZar =
      slot && typeof slot.price === "number" && Number.isFinite(slot.price) ? slot.price : null;
    return {
      time,
      priceZar,
      priceDemandBand: slotDemandPriceBand(priceZar, averageSlotPrice),
      selected: selectedTime === time,
      dimUnselected: dimOtherSlots,
      onSelect: () => {
        void handleSelectSlot(time);
      },
      assistantRecommended: recommendations ? time === recommendations.recommended.time : false,
      recommendedBadgeText: bookingCopy.when.recommended,
    };
  }

  return (
    <BookingLayout
      summaryState={summaryState ?? undefined}
      suppressEstimateUntilLocked
      canContinue={canContinue}
      onContinue={onNext}
      continueLabel={continueLabel}
      stickyMobileBar={stickyBar}
      footerTotalZar={locked ? getLockedBookingDisplayPrice(locked) : undefined}
      footerSubcopy={
        !locked ? <p className="text-center">{bookingCopy.errors.time}</p> : undefined
      }
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {bookingCopy.when.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {bookingCopy.when.intro}
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Prices vary by time based on demand.
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
            <section className="space-y-3" aria-labelledby="date-heading">
              <h2 id="date-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {bookingCopy.when.dateHeading}
              </h2>
              <BookingDateSelector
                selected={selectedDate}
                onSelect={(ymd) => setDateOverride(ymd)}
              />
            </section>

            {lockBaseState ? (
              <div id="booking-time-slots" className="scroll-mt-28 space-y-8">
                {slotsLoading ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                      />
                    ))}
                  </div>
                ) : null}
                {slotsError ? <p className="text-sm text-rose-700 dark:text-rose-400">{slotsError}</p> : null}
                {!slotsLoading && !slotsError && allSlotTimes.length === 0 ? (
                  <p className="text-sm text-amber-800 dark:text-amber-400/90">
                    No time slots available — try another day
                  </p>
                ) : null}
                <section className="space-y-3" aria-labelledby="morning-heading">
                  <div>
                    <h2 id="morning-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {bookingCopy.when.morningHeading}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{bookingCopy.when.morningHint}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {allSlotTimes.filter((t) => Number(t.slice(0, 2)) < 12).map((time) => {
                      const p = slotCardProps(time);
                      return p ? <TimeSlotCard key={time} {...p} /> : null;
                    })}
                  </div>
                </section>

                <AfternoonSlotSection
                  key={selectedDate}
                  times={allSlotTimes.filter((t) => Number(t.slice(0, 2)) >= 12)}
                  renderSlot={(time) => {
                    const p = slotCardProps(time);
                    return p ? <TimeSlotCard key={time} {...p} /> : null;
                  }}
                />

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
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-950 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-50"
                    role="status"
                  >
                    <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                    <span>Price locked for this time.</span>
                  </div>
                ) : null}

              </div>
            ) : null}
          </>
        )}
      </div>
    </BookingLayout>
  );
}
