"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { BOOKING_CALENDAR_DAYS, generateNextDates } from "@/components/booking/BookingDateStrip";
import { useCleaners } from "@/components/booking/useCleaners";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { bookingCopy } from "@/lib/booking/copy";
import { clearSelectedCleanerFromStorage, writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";
import { getLockedBookingDisplayPrice, lockedToStep1State, lockBookingSlot, mergeCleanerIdIntoLockedBooking } from "@/lib/booking/lockedBooking";
import { quoteJobDurationHours } from "@/lib/pricing/pricingEngine";
import {
  minSlotPrice,
  orderSlotTimesForDisplay,
  pickRecommendedSlot,
  slotStrategyBadge,
  type SlotPickInput,
} from "@/lib/pricing/slotRevenueStrategy";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { ScheduleUpsellBar } from "@/components/booking/ScheduleUpsellBar";

type LiveSlot = {
  time: string;
  available: boolean;
  cleanersCount: number;
  price?: number;
  duration?: number;
  surgeMultiplier?: number;
  surgeApplied?: boolean;
};

const INITIAL_VISIBLE_SLOTS = 5;
const SLOT_START_MIN = 7 * 60;
const SLOT_END_MIN = 12 * 60 + 30;

type StepScheduleProps = {
  onNext: () => void;
  onBack: () => void;
};

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

function dateChipLabel(ymd: string): { dow: string; day: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dow: date.toLocaleDateString("en-ZA", { weekday: "short" }),
    day: date.toLocaleDateString("en-ZA", { day: "numeric" }),
  };
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
  const autoLockRunRef = useRef<string>("");

  const allDateValues = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value), []);
  const lockedDateInRange = locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const isToday = selectedDate === ymdTodayLocal();
  const nowPlusOneHour = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + 60;
  }, [selectedDate]);

  const extrasJoinKey = lockBaseState?.extras.join("\u0001") ?? "";
  const slotPricingDepsKey = useMemo(() => {
    if (!lockBaseState) return "";
    return [
      lockBaseState.rooms,
      lockBaseState.bathrooms,
      lockBaseState.extraRooms,
      extrasJoinKey,
      lockBaseState.service ?? "",
      lockBaseState.service_type ?? "",
      vipTier,
    ].join("|");
  }, [
    lockBaseState,
    lockBaseState?.rooms,
    lockBaseState?.bathrooms,
    lockBaseState?.extraRooms,
    extrasJoinKey,
    lockBaseState?.service,
    lockBaseState?.service_type,
    vipTier,
  ]);

  const durationLine = useMemo(() => {
    const durs = liveSlots.filter((s) => s.available && typeof s.duration === "number" && Number.isFinite(s.duration)).map((s) => s.duration!);
    if (durs.length) return formatDurationLine(durs.reduce((a, b) => a + b, 0) / durs.length);
    if (!lockBaseState) return "";
    const hours = quoteJobDurationHours(
      {
        service: lockBaseState.service,
        serviceType: lockBaseState.service_type,
        rooms: lockBaseState.rooms,
        bathrooms: lockBaseState.bathrooms,
        extraRooms: lockBaseState.extraRooms,
        extras: lockBaseState.extras,
      },
      vipTier,
    );
    return formatDurationLine(hours);
  }, [liveSlots, lockBaseState, vipTier]);

  useEffect(() => setShowAllTimes(false), [selectedDate]);

  useEffect(() => {
    autoLockRunRef.current = "";
  }, [selectedDate, slotPricingDepsKey]);

  useEffect(() => {
    if (!lockBaseState) return;
    let active = true;
    void (async () => {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const hours = quoteJobDurationHours(
          {
            service: lockBaseState.service,
            serviceType: lockBaseState.service_type,
            rooms: lockBaseState.rooms,
            bathrooms: lockBaseState.bathrooms,
            extraRooms: lockBaseState.extraRooms,
            extras: lockBaseState.extras,
          },
          vipTier,
        );
        const params = new URLSearchParams();
        params.set("date", selectedDate);
        params.set("duration", String(Math.round(hours * 60)));
        const svc = lockBaseState.service_type ?? lockBaseState.service;
        if (svc) params.set("serviceType", String(svc));
        params.set("bedrooms", String(Math.max(1, lockBaseState.rooms)));
        params.set("bathrooms", String(Math.max(1, lockBaseState.bathrooms)));
        params.set("extraRooms", String(Math.max(0, lockBaseState.extraRooms)));
        if (lockBaseState.extras.length) params.set("extras", lockBaseState.extras.join(","));
        params.set("vipTier", vipTier);
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
  }, [lockBaseState, selectedDate, vipTier, slotPricingDepsKey]);

  const slotPickRows: SlotPickInput[] = useMemo(() => {
    return liveSlots
      .filter((s) => {
        if (!s.available) return false;
        const mins = hmToMinutes(s.time);
        if (mins < SLOT_START_MIN || mins > SLOT_END_MIN) return false;
        if (isToday && mins < nowPlusOneHour) return false;
        return typeof s.price === "number" && Number.isFinite(s.price);
      })
      .map((s) => ({ time: s.time, price: s.price!, cleanersCount: s.cleanersCount ?? 0 }));
  }, [liveSlots, isToday, nowPlusOneHour]);

  const strategyRecommendedTime = useMemo(() => pickRecommendedSlot(slotPickRows), [slotPickRows]);
  const strategyMinPrice = useMemo(() => minSlotPrice(slotPickRows), [slotPickRows]);

  const orderedDisplayTimes = useMemo(() => {
    return orderSlotTimesForDisplay(slotPickRows, strategyRecommendedTime);
  }, [slotPickRows, strategyRecommendedTime]);

  const visibleSlotTimes = useMemo(
    () => (showAllTimes ? orderedDisplayTimes : orderedDisplayTimes.slice(0, INITIAL_VISIBLE_SLOTS)),
    [orderedDisplayTimes, showAllTimes],
  );
  const selectedTime = useMemo(() => (locked && locked.date === selectedDate ? locked.time : null), [locked, selectedDate]);

  const cleanerSlotTime = selectedTime ?? strategyRecommendedTime ?? "09:00";
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
      return {
        totalZar,
        totalCaption: "Price confirmed",
        ctaShort: "Continue →",
        openSummarySheetOnAmountTap: true,
      };
    }
    return {
      totalZar: 0,
      totalCaption: "From",
      amountDisplayOverride: "Select a time",
      ctaShort: "Continue →",
      openSummarySheetOnAmountTap: true,
    };
  }, [lockBaseState, locked]);

  const handleSelectSlot = useCallback(
    async (time: string) => {
      if (!lockBaseState) return;
      const slot = liveSlots.find((s) => s.time === time);
      if (!slot) return;
      const res = await fetch("/api/booking/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: lockBaseState.service,
          service_type: lockBaseState.service_type,
          rooms: lockBaseState.rooms,
          bathrooms: lockBaseState.bathrooms,
          extraRooms: lockBaseState.extraRooms,
          extras: lockBaseState.extras,
          date: selectedDate,
          time,
          cleanersCount: slot.cleanersCount,
          vipTier,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pricingVersion?: number;
        total?: number;
        hours?: number;
        surgeMultiplier?: number;
        surgeApplied?: boolean;
        surgeLabel?: string;
        signature?: string;
        lockExpiresAt?: string;
        breakdown?: {
          subtotalZar?: number;
          afterVipSubtotalZar?: number;
          vipSavingsZar?: number;
        };
      };
      if (!res.ok || json.ok !== true || typeof json.total !== "number" || typeof json.hours !== "number") return;
      if (typeof json.signature !== "string" || !/^[0-9a-f]{64}$/i.test(json.signature)) return;
      if (typeof json.lockExpiresAt !== "string" || !json.lockExpiresAt.trim()) return;
      const b = json.breakdown;
      lockBookingSlot(lockBaseState, { date: selectedDate, time }, {
        vipTier,
        lockedQuote: {
          total: json.total,
          hours: json.hours,
          surge: Number(json.surgeMultiplier ?? 1),
          surgeLabel: json.surgeLabel ?? (json.surgeApplied ? "High demand" : "Standard"),
          cleanersCount: slot.cleanersCount,
          quoteSubtotalZar: typeof b?.subtotalZar === "number" ? b.subtotalZar : undefined,
          quoteAfterVipSubtotalZar: typeof b?.afterVipSubtotalZar === "number" ? b.afterVipSubtotalZar : undefined,
          quoteVipSavingsZar: typeof b?.vipSavingsZar === "number" ? b.vipSavingsZar : undefined,
          quoteSignature: json.signature,
          lockExpiresAt: json.lockExpiresAt,
          pricingVersion: typeof json.pricingVersion === "number" ? json.pricingVersion : undefined,
        },
      });
    },
    [lockBaseState, liveSlots, selectedDate, vipTier],
  );

  useEffect(() => {
    if (!lockBaseState || slotsLoading || orderedDisplayTimes.length === 0) return;
    if (locked?.date === selectedDate && locked.time) return;
    const rec = strategyRecommendedTime;
    if (!rec || !orderedDisplayTimes.includes(rec)) return;
    const key = `${selectedDate}|${rec}`;
    if (autoLockRunRef.current === key) return;
    autoLockRunRef.current = key;
    void handleSelectSlot(rec);
  }, [
    lockBaseState,
    slotsLoading,
    orderedDisplayTimes,
    strategyRecommendedTime,
    selectedDate,
    locked?.date,
    locked?.time,
    handleSelectSlot,
  ]);

  function slotCardProps(time: string) {
    const slot = liveSlots.find((s) => s.time === time);
    const priceZar = slot && typeof slot.price === "number" && Number.isFinite(slot.price) ? slot.price : null;
    const row = slotPickRows.find((r) => r.time === time);
    const strategyBadge = row ? slotStrategyBadge(time, strategyRecommendedTime, strategyMinPrice, row) : null;
    return {
      time,
      priceZar,
      strategyBadge,
      selected: selectedTime === time,
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
      summaryDesktopOnly
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
          {isToday && slotPickRows.length > 0 && slotPickRows.length <= 4 ? (
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300/90" role="status">
              {bookingCopy.when.spotsLeftToday(slotPickRows.length)}
            </p>
          ) : null}
          {lockBaseState && lockBaseState.extraRooms > 0 ? (
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Slot prices include{" "}
              <span className="font-medium tabular-nums">
                {lockBaseState.extraRooms} extra room{lockBaseState.extraRooms === 1 ? "" : "s"}
              </span>
              ; add-on services are priced separately.
            </p>
          ) : null}
        </div>

        {!lockBaseState ? (
          <p className="text-sm text-amber-800 dark:text-amber-400/90">No saved booking yet. Start your booking from step 1.</p>
        ) : (
          <>
            <section className="space-y-3" aria-labelledby="date-heading">
              <h2 id="date-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{bookingCopy.when.dateHeading}</h2>
              <div className="flex items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {allDateValues.map((date) => {
                  const { dow, day } = dateChipLabel(date);
                  const active = selectedDate === date;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setDateOverride(date)}
                      className={[
                        "h-[72px] min-w-[64px] shrink-0 rounded-xl border px-1 text-xs",
                        "flex flex-col items-center justify-center transition",
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                      ].join(" ")}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{dow}</span>
                      <span className="mt-1 text-sm font-semibold tabular-nums">{day}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <ScheduleUpsellBar state={lockBaseState} />

            <div id="booking-time-slots" className="scroll-mt-28 space-y-5">
              {slotsLoading ? (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
                  ))}
                </div>
              ) : null}
              {slotsError ? <p className="text-sm text-rose-700 dark:text-rose-400">{slotsError}</p> : null}

              {!slotsLoading && !slotsError && orderedDisplayTimes.length === 0 ? (
                isToday ? (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
                    <p>All time slots for today are no longer available</p>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = tomorrowYmd(allDateValues);
                        if (tomorrow) setDateOverride(tomorrow);
                      }}
                      className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
                    >
                      Book for tomorrow
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
                    <p>No slots left on this day.</p>
                    <p className="font-medium">
                      Next availability: try tomorrow from 09:00 — pick another date above.
                    </p>
                  </div>
                )
              ) : null}

              {orderedDisplayTimes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {visibleSlotTimes.map((time) => {
                    const p = slotCardProps(time);
                    const badge =
                      p.strategyBadge === "recommended"
                        ? "Recommended"
                        : p.strategyBadge === "best-value"
                          ? "Best value"
                          : p.strategyBadge === "filling-fast"
                            ? "Filling fast"
                            : null;
                    const badgeClass =
                      p.strategyBadge === "recommended"
                        ? "text-blue-600 dark:text-blue-300"
                        : p.strategyBadge === "best-value"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : p.strategyBadge === "filling-fast"
                            ? "text-amber-800 dark:text-amber-400"
                            : "text-transparent";
                    const badgeHint =
                      p.strategyBadge === "recommended"
                        ? bookingCopy.when.badgeHintRecommended
                        : p.strategyBadge === "best-value"
                          ? bookingCopy.when.badgeHintBestValue
                          : p.strategyBadge === "filling-fast"
                            ? bookingCopy.when.badgeHintFillingFast
                            : null;
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => void handleSelectSlot(time)}
                        className={[
                          "w-full rounded-xl border p-4 transition",
                          "flex items-center justify-between text-left",
                          p.selected
                            ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="text-base font-medium tabular-nums">{p.time}</div>
                          <div className={["mt-1 min-h-[1rem] text-sm font-medium", badgeClass].join(" ")}>
                            {badge ?? "—"}
                          </div>
                          {badgeHint ? (
                            <p className="mt-0.5 text-[11px] font-normal leading-snug text-zinc-500 dark:text-zinc-400">
                              {badgeHint}
                            </p>
                          ) : (
                            <div className="mt-0.5 min-h-[0.875rem]" aria-hidden />
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums">
                            {p.priceZar != null ? `R ${p.priceZar.toLocaleString("en-ZA")}` : "—"}
                          </div>
                          {vipTier !== "regular" && p.priceZar != null ? (
                            <p className="mt-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              Member price applied
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {orderedDisplayTimes.length > INITIAL_VISIBLE_SLOTS && !showAllTimes ? (
                <button
                  type="button"
                  onClick={() => setShowAllTimes(true)}
                  className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-200"
                >
                  {bookingCopy.when.seeMoreTimes}
                </button>
              ) : null}

              {locked && locked.date === selectedDate && selectedTime ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-50">
                  <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                  <span>Price locked for this time.</span>
                </div>
              ) : null}

              {selectedTime ? (
                <section className="space-y-3" aria-labelledby="cleaner-heading">
                  <h2 id="cleaner-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Choose your cleaner</h2>
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
                </section>
              ) : null}
            </div>
          </>
        )}
      </div>
    </BookingLayout>
  );
}
