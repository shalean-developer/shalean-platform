"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { BOOKING_CALENDAR_DAYS, BookingDateSelector, generateNextDates } from "@/components/booking/BookingDateStrip";
import { TimeSlotCard, type SlotDemandPriceBand } from "@/components/booking/TimeSlotCard";
import { useCleaners } from "@/components/booking/useCleaners";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { bookingCopy } from "@/lib/booking/copy";
import { clearSelectedCleanerFromStorage, writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";
import { getLockedBookingDisplayPrice, lockedToStep1State, lockBookingSlot, mergeCleanerIdIntoLockedBooking } from "@/lib/booking/lockedBooking";
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

const INITIAL_VISIBLE_SLOTS = 7;
const SLOT_START_MIN = 7 * 60;
const SLOT_END_MIN = 12 * 60 + 30;

type StepScheduleProps = {
  onNext: () => void;
  onBack: () => void;
};

function slotDemandPriceBand(price: number | null, avg: number | null): SlotDemandPriceBand | null {
  if (price == null || avg == null || !Number.isFinite(price) || !Number.isFinite(avg) || avg <= 0) return null;
  if (price < avg) return "best-value";
  if (price > avg) return "peak";
  return "standard";
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function ymdTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowYmd(allDateValues: string[]): string | null {
  return allDateValues.length > 1 ? allDateValues[1]! : null;
}

function formatDurationLine(hours: number): string {
  const h = hours % 1 === 0 ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return `≈ ${h} hrs`;
}

export function StepScheduleV2({ onNext, onBack }: StepScheduleProps) {
  void onBack;
  const step1 = usePersistedBookingSummaryState();
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const { tier: vipTier } = useBookingVipTier();
  const summaryState = step1 ?? (locked ? lockedToStep1State(locked) : null);
  const lockBaseState = step1 ?? (locked ? lockedToStep1State(locked) : null);

  const [liveSlots, setLiveSlots] = useState<LiveSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [autoAssignCleaner, setAutoAssignCleaner] = useState(true);
  const cleanerCarouselRef = useRef<HTMLDivElement | null>(null);

  const allDateValues = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value), []);
  const lockedDateInRange = locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const isToday = selectedDate === ymdTodayLocal();
  const nowPlusOneHour = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + 60;
  }, [selectedDate]);

  const slotPriceByTime = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of liveSlots) if (s.available && typeof s.price === "number" && Number.isFinite(s.price)) m[s.time] = s.price;
    return m;
  }, [liveSlots]);
  const averageSlotPrice = useMemo(() => {
    const vals = Object.values(slotPriceByTime);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [slotPriceByTime]);

  const durationLine = useMemo(() => {
    const durs = liveSlots.filter((s) => s.available && typeof s.duration === "number" && Number.isFinite(s.duration)).map((s) => s.duration!);
    if (durs.length) return formatDurationLine(durs.reduce((a, b) => a + b, 0) / durs.length);
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

  useEffect(() => setShowAllTimes(false), [selectedDate]);

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
        setLiveSlots(json.slots ?? []);
      } catch {
        if (active) setSlotsError("Failed to load time slots.");
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [lockBaseState, selectedDate]);

  const candidateSlotTimes = useMemo(
    () =>
      liveSlots
        .filter((s) => s.available)
        .map((s) => s.time)
        .filter((time) => {
          const mins = hmToMinutes(time);
          if (mins < SLOT_START_MIN || mins > SLOT_END_MIN) return false;
          if (isToday && mins < nowPlusOneHour) return false;
          return true;
        }),
    [liveSlots, isToday, nowPlusOneHour],
  );
  const visibleSlotTimes = useMemo(
    () => (showAllTimes ? candidateSlotTimes : candidateSlotTimes.slice(0, INITIAL_VISIBLE_SLOTS)),
    [candidateSlotTimes, showAllTimes],
  );
  const recommendedTime = candidateSlotTimes[0] ?? null;
  const selectedTime = useMemo(() => (locked && locked.date === selectedDate ? locked.time : null), [locked, selectedDate]);
  const dimOtherSlots = selectedTime !== null;

  const cleanerSlotTime = selectedTime ?? recommendedTime;
  const { cleaners: cleanerPool, recommendedCleaner, loading: cleanersLoading, error: cleanersError } = useCleaners({
    selectedDate,
    selectedTime: cleanerSlotTime,
  });

  const continueLabel = locked ? bookingCopy.when.cta : "Select a time";
  const canContinue = locked != null && (autoAssignCleaner || !!selectedCleaner);

  const stickyBar = useMemo(() => {
    if (!lockBaseState) return undefined;
    if (locked) {
      const totalZar = getLockedBookingDisplayPrice(locked);
      const sub = locked.finalHours % 1 === 0 ? String(locked.finalHours) : locked.finalHours.toFixed(1).replace(/\.0$/, "");
      return { totalZar, subline: `≈ ${sub} hrs`, ctaUrgency: bookingCopy.stickyBar.urgencyCleanerAvailable };
    }
    return {
      totalZar: 0,
      amountDisplayOverride: "Select a time",
      subline: durationLine || undefined,
      ctaUrgency: bookingCopy.stickyBar.urgencySlotsFilling,
    };
  }, [durationLine, lockBaseState, locked]);

  async function handleSelectSlot(time: string) {
    if (!lockBaseState) return;
    const slot = liveSlots.find((s) => s.time === time);
    if (!slot) return;
    if (typeof slot.price === "number" && Number.isFinite(slot.price) && typeof slot.duration === "number" && Number.isFinite(slot.duration)) {
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
    const json = (await res.json()) as { price?: number; duration?: number; surgeMultiplier?: number; surgeApplied?: boolean };
    if (!res.ok || typeof json.price !== "number" || typeof json.duration !== "number") return;
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

  function slotCardProps(time: string) {
    const slot = liveSlots.find((s) => s.time === time);
    const priceZar = slot && typeof slot.price === "number" && Number.isFinite(slot.price) ? slot.price : null;
    return {
      time,
      priceZar,
      priceDemandBand: slotDemandPriceBand(priceZar, averageSlotPrice),
      selected: selectedTime === time,
      dimUnselected: dimOtherSlots,
      onSelect: () => void handleSelectSlot(time),
      assistantRecommended: time === recommendedTime,
      recommendedBadgeText: "Recommended",
    };
  }

  function selectCleaner(id: string, name: string) {
    setAutoAssignCleaner(false);
    writeSelectedCleanerToStorage({ id, name });
    mergeCleanerIdIntoLockedBooking(id);
  }

  function enableAutoAssign() {
    setAutoAssignCleaner(true);
    clearSelectedCleanerFromStorage();
  }

  function scrollCleanerCarousel(direction: "left" | "right") {
    const el = cleanerCarouselRef.current;
    if (!el) return;
    const delta = direction === "left" ? -192 : 192;
    el.scrollBy({ left: delta, behavior: "smooth" });
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
      footerSubcopy={!locked ? <p className="text-center">{bookingCopy.errors.time}</p> : undefined}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{bookingCopy.when.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{bookingCopy.when.intro}</p>
        </div>

        {!lockBaseState ? (
          <p className="text-sm text-amber-800 dark:text-amber-400/90">No saved booking yet. Start your booking from step 1.</p>
        ) : (
          <>
            <section className="space-y-3" aria-labelledby="date-heading">
              <h2 id="date-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{bookingCopy.when.dateHeading}</h2>
              <BookingDateSelector selected={selectedDate} onSelect={setDateOverride} />
            </section>

            <div id="booking-time-slots" className="scroll-mt-28 space-y-5">
              {slotsLoading ? (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
                  ))}
                </div>
              ) : null}
              {slotsError ? <p className="text-sm text-rose-700 dark:text-rose-400">{slotsError}</p> : null}

              {!slotsLoading && !slotsError && candidateSlotTimes.length === 0 ? (
                isToday ? (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
                    <p>All time slots for today are no longer available</p>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = tomorrowYmd(allDateValues);
                        if (tomorrow) setDateOverride(tomorrow);
                      }}
                      className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white dark:bg-amber-700"
                    >
                      Book for tomorrow
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-amber-800 dark:text-amber-400/90">No time slots available — try another day</p>
                )
              ) : null}

              {candidateSlotTimes.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {visibleSlotTimes.map((time) => {
                    const p = slotCardProps(time);
                    return <TimeSlotCard key={time} {...p} />;
                  })}
                </div>
              ) : null}

              {candidateSlotTimes.length > INITIAL_VISIBLE_SLOTS && !showAllTimes ? (
                <button
                  type="button"
                  onClick={() => setShowAllTimes(true)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-200"
                >
                  Show all times
                </button>
              ) : null}

              {locked && locked.date === selectedDate && selectedTime ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-50">
                  <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                  <span>Price locked for this time.</span>
                </div>
              ) : null}

              <section className="space-y-3" aria-labelledby="cleaner-heading">
                <h2 id="cleaner-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Choose your cleaner</h2>
                {!selectedTime ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Pick a time first to load available cleaners.</p>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => scrollCleanerCarousel("left")}
                      className="absolute left-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-md transition hover:border-blue-300 hover:text-blue-700 md:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      aria-label="Previous cleaners"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollCleanerCarousel("right")}
                      className="absolute right-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-md transition hover:border-blue-300 hover:text-blue-700 md:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      aria-label="Next cleaners"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    <div
                      ref={cleanerCarouselRef}
                      className="flex gap-3 overflow-x-auto px-0 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-10"
                    >
                      <button
                        type="button"
                        onClick={enableAutoAssign}
                        className={[
                          "relative w-[160px] shrink-0 rounded-xl border p-3 transition duration-200 hover:scale-[1.02]",
                          "flex flex-col items-center gap-2 text-center",
                          autoAssignCleaner
                            ? "border-blue-500 bg-blue-50 text-blue-900"
                            : "border-zinc-200 bg-white hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900",
                        ].join(" ")}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                          Auto
                        </div>
                        <p className="text-sm font-semibold">Auto-assign</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Best match</p>
                      </button>

                      {cleanersLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[128px] w-[160px] shrink-0 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                          />
                        ))
                      ) : cleanersError ? (
                        <p className="text-sm text-rose-700 dark:text-rose-400">{cleanersError}</p>
                      ) : cleanerPool.length === 0 ? (
                        <p className="text-sm text-amber-800 dark:text-amber-400/90">No cleaners available for this time.</p>
                      ) : (
                        cleanerPool.slice(0, 6).map((c) => {
                          const isSelected = !autoAssignCleaner && selectedCleaner?.id === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCleaner(c.id, c.full_name)}
                              className={[
                                "relative w-[160px] shrink-0 rounded-xl border p-3 transition duration-200 hover:scale-[1.02]",
                                "flex flex-col items-center gap-2 text-center",
                                isSelected
                                  ? "border-blue-500 bg-blue-50 text-blue-900"
                                  : "border-zinc-200 bg-white hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900",
                              ].join(" ")}
                            >
                              {recommendedCleaner?.id === c.id ? (
                                <span className="absolute right-2 top-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-900 dark:bg-blue-950/70 dark:text-blue-100">
                                  Best
                                </span>
                              ) : c.rating >= 4.8 ? (
                                <span className="absolute right-2 top-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                  Top
                                </span>
                              ) : null}
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                {c.full_name.slice(0, 1).toUpperCase()}
                              </div>
                              <p className="w-full truncate text-sm font-semibold">{c.full_name}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                ⭐ {c.rating.toFixed(1)} · {c.jobs_completed.toLocaleString("en-ZA")} jobs
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </BookingLayout>
  );
}
