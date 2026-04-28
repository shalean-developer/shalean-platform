"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { AvailabilityMessage } from "@/components/booking/AvailabilityMessage";
import { BOOKING_CALENDAR_DAYS, generateNextDates } from "@/components/booking/BookingDateStrip";
import { useCleaners } from "@/components/booking/useCleaners";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { bookingCopy } from "@/lib/booking/copy";
import { clearSelectedCleanerFromStorage, writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";
import { getLockedBookingDisplayPrice, lockedToStep1State, lockBookingSlot, mergeCleanerIdIntoLockedBooking } from "@/lib/booking/lockedBooking";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import type { RawAvailabilitySlot } from "@/lib/booking/enrichAvailabilitySlots";
import {
  loadSlotPricesParallel,
  quoteSlotPriceExact,
  refineSlotPricesExact,
  type SlotPriceEntry,
} from "@/lib/booking/loadSlotPricesParallel";
import {
  minSlotPrice,
  orderSlotTimesForDisplay,
  pickRecommendedSlot,
  slotStrategyBadge,
  type SlotPickInput,
} from "@/lib/pricing/slotRevenueStrategy";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { ScheduleUpsellBar } from "@/components/booking/ScheduleUpsellBar";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

const AVAILABILITY_SLOT_CACHE_TTL_MS = 50_000;
const availabilitySlotCache = new Map<string, { slots: RawAvailabilitySlot[]; at: number }>();

/** First screen: up to 8 slot cards before “see more”. */
const INITIAL_VISIBLE_SLOTS = 8;
/** Must match `/api/booking/time-slots` (startHour 7, endHour 18, step 30). Was 12:30 — hid all afternoon slots. */
const SLOT_START_MIN = 7 * 60;
const SLOT_END_MIN = 18 * 60;

function pickFirstTwoRefineTimes(
  raw: readonly RawAvailabilitySlot[],
  isToday: boolean,
  nowPlusOneHour: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (!s.available) continue;
    const mins = hmToMinutes(s.time);
    if (mins < SLOT_START_MIN || mins > SLOT_END_MIN) continue;
    if (isToday && mins < nowPlusOneHour) continue;
    if (seen.has(s.time)) continue;
    seen.add(s.time);
    out.push(s.time);
    if (out.length >= 2) break;
  }
  return out;
}

type StepScheduleProps = {
  onNext: () => void;
  onBack: () => void;
};

function isTeamServiceType(serviceType?: string | null): boolean {
  const value = String(serviceType ?? "").toLowerCase();
  return value.includes("deep") || value.includes("move");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function nextAvailableHint(allDateValues: string[], selectedDate: string): string {
  const next = allDateValues.find((d) => d > selectedDate);
  const ymd = next ?? (allDateValues.length > 1 ? allDateValues[1]! : null);
  if (!ymd) return "Slots available on upcoming dates — pick another date above.";
  const [y, m, d] = ymd.split("-").map(Number);
  const when = new Date(y, m - 1, d);
  const label = when.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
  return `Slots available on ${label} — pick that date above.`;
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

function formatScheduleDateHint(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  const dt = new Date(y, m - 1, d);
  const label = dt.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
  return `${label} — pick a time`;
}

export function StepScheduleV2({ onNext, onBack }: StepScheduleProps) {
  void onBack;
  const step1 = usePersistedBookingSummaryState();
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const { tier: vipTier } = useBookingVipTier();
  const {
    fingerprint: pricingFingerprint,
    canonicalDurationHours,
    canonicalTotalZar,
    job: pricingJob,
    catalog,
  } = useBookingPrice();
  const summaryState = step1 ?? (locked ? lockedToStep1State(locked) : null);
  const lockBaseState = step1 ?? (locked ? lockedToStep1State(locked) : null);

  const [rawSlots, setRawSlots] = useState<RawAvailabilitySlot[]>([]);
  const [slotPrices, setSlotPrices] = useState<Record<string, SlotPriceEntry>>({});
  const [slotPricesPending, setSlotPricesPending] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotHint, setSlotHint] = useState<string | null>(null);
  const [slotFetchNonce, setSlotFetchNonce] = useState(0);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [autoAssignCleaner, setAutoAssignCleaner] = useState(true);
  const cleanerCarouselRef = useRef<HTMLDivElement | null>(null);
  const autoLockRunRef = useRef<string>("");
  const prevTrackedPriceRef = useRef<number | null>(null);
  const skipAvailabilityCacheOnceRef = useRef(false);
  const lockFailedTimeKeysRef = useRef<Set<string>>(new Set());

  const allDateValues = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value), []);
  const lockedDateInRange = locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const isToday = selectedDate === ymdTodayLocal();
  const nowPlusOneHour = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + 60;
  }, [selectedDate]);

  useEffect(() => {
    if (!slotHint) return;
    const t = window.setTimeout(() => setSlotHint(null), 5200);
    return () => window.clearTimeout(t);
  }, [slotHint]);

  const durationMinutesForApi = useMemo(() => {
    if (canonicalDurationHours == null) return 120;
    return Math.max(30, Math.round(canonicalDurationHours * 60));
  }, [canonicalDurationHours]);

  const forceAvailabilityRefresh = useCallback(() => {
    skipAvailabilityCacheOnceRef.current = true;
    availabilitySlotCache.delete(`${selectedDate}|${durationMinutesForApi}`);
    setSlotFetchNonce((n) => n + 1);
  }, [selectedDate, durationMinutesForApi]);

  const durationLine = useMemo(() => {
    if (canonicalDurationHours != null) return formatDurationLine(canonicalDurationHours);
    return "";
  }, [canonicalDurationHours]);

  const scheduleDateHint = useMemo(() => formatScheduleDateHint(selectedDate), [selectedDate]);

  useEffect(() => {
    setShowAllTimes(false);
    setSlotHint(null);
    lockFailedTimeKeysRef.current = new Set();
  }, [selectedDate]);

  useEffect(() => {
    autoLockRunRef.current = "";
  }, [selectedDate, pricingFingerprint]);

  useEffect(() => {
    if (!lockBaseState) return;
    const cacheKey = `${selectedDate}|${durationMinutesForApi}`;
    const bypassCache = skipAvailabilityCacheOnceRef.current;
    if (bypassCache) skipAvailabilityCacheOnceRef.current = false;
    const cached = availabilitySlotCache.get(cacheKey);
    if (!bypassCache && cached && Date.now() - cached.at < AVAILABILITY_SLOT_CACHE_TTL_MS) {
      setRawSlots(cached.slots);
      setSlotsLoading(false);
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    void (async () => {
      if (cancelled) return;
      try {
        const params = new URLSearchParams();
        params.set("date", selectedDate);
        params.set("duration", String(durationMinutesForApi));
        const url = `/api/booking/time-slots?${params.toString()}`;
        let lastSlots: RawAvailabilitySlot[] = [];
        let ok = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await fetch(url);
          const json = (await res.json()) as { slots?: RawAvailabilitySlot[]; error?: string };
          if (cancelled) return;
          if (res.ok) {
            ok = true;
            lastSlots = json.slots ?? [];
            break;
          }
          trackBookingFunnelEvent("datetime", "error", {
            message: json.error ?? `status_${res.status}`,
            action: "time_slots_fetch",
            date: selectedDate,
            attempt,
          });
          if (attempt === 0) await sleep(400);
        }
        if (cancelled) return;
        if (!ok) {
          setRawSlots([]);
          setSlotHint("We’re refreshing availability — try another date or check back in a moment.");
          trackBookingFunnelEvent("datetime", "error", {
            message: "time_slots_fetch_exhausted",
            action: "time_slots_fetch",
            date: selectedDate,
          });
          return;
        }
        availabilitySlotCache.set(cacheKey, { slots: lastSlots, at: Date.now() });
        setRawSlots(lastSlots);
      } catch {
        if (!cancelled) {
          setRawSlots([]);
          setSlotHint("Checking connection — you can still pick another date.");
          trackBookingFunnelEvent("datetime", "error", {
            message: "time_slots_network",
            action: "time_slots_fetch",
          });
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setSlotsLoading(false);
    };
  }, [lockBaseState, selectedDate, durationMinutesForApi, slotFetchNonce]);

  const windowedAvailableSlots = useMemo(() => {
    return rawSlots.filter((s) => {
      if (!s.available) return false;
      const mins = hmToMinutes(s.time);
      if (mins < SLOT_START_MIN || mins > SLOT_END_MIN) return false;
      if (isToday && mins < nowPlusOneHour) return false;
      return true;
    });
  }, [rawSlots, isToday, nowPlusOneHour]);

  const chronologicalDisplayTimes = useMemo(() => {
    const times = [...new Set(windowedAvailableSlots.map((s) => s.time))];
    return times.sort((a, b) => a.localeCompare(b));
  }, [windowedAvailableSlots]);

  useEffect(() => {
    if (!catalog || !pricingJob || rawSlots.length === 0) {
      setSlotPrices({});
      setSlotPricesPending(false);
      return;
    }
    let cancelled = false;
    setSlotPrices({});
    setSlotPricesPending(true);
    /** DOM timer id (`number`); avoid `ReturnType<typeof setTimeout>` which resolves to `NodeJS.Timeout` under `@types/node`. */
    let refineTimer: number | undefined;
    void loadSlotPricesParallel(rawSlots, pricingJob, catalog, vipTier, pricingFingerprint)
      .then((map) => {
        if (cancelled) return;
        setSlotPrices(map);
        setSlotPricesPending(false);
        const refineTimes = pickFirstTwoRefineTimes(rawSlots, isToday, nowPlusOneHour);
        if (refineTimes.length === 0) return;
        refineTimer = window.setTimeout(() => {
          if (cancelled) return;
          void refineSlotPricesExact(rawSlots, refineTimes, pricingJob, catalog, vipTier, pricingFingerprint).then(
            (patch) => {
              if (cancelled) return;
              setSlotPrices((prev) => ({ ...prev, ...patch }));
            },
          );
        }, 0);
      })
      .catch(() => {
        if (!cancelled) setSlotPricesPending(false);
      });
    return () => {
      cancelled = true;
      if (refineTimer != null) window.clearTimeout(refineTimer);
    };
  }, [rawSlots, catalog, pricingJob, vipTier, pricingFingerprint, isToday, nowPlusOneHour]);

  const slotPickRows: SlotPickInput[] = useMemo(() => {
    const byTime = new Map<string, SlotPickInput>();
    for (const s of windowedAvailableSlots) {
      const p = slotPrices[s.time]?.price;
      if (typeof p !== "number" || !Number.isFinite(p)) continue;
      byTime.set(s.time, { time: s.time, price: p, cleanersCount: s.cleanersCount ?? 0 });
    }
    return [...byTime.values()];
  }, [windowedAvailableSlots, slotPrices]);

  const strategyRecommendedTime = useMemo(() => pickRecommendedSlot(slotPickRows), [slotPickRows]);
  const strategyMinPrice = useMemo(() => minSlotPrice(slotPickRows), [slotPickRows]);

  const orderedDisplayTimes = useMemo(() => {
    if (slotPickRows.length === 0) return chronologicalDisplayTimes;
    return orderSlotTimesForDisplay(slotPickRows, strategyRecommendedTime);
  }, [slotPickRows, strategyRecommendedTime, chronologicalDisplayTimes]);

  const visibleSlotTimes = useMemo(
    () => (showAllTimes ? orderedDisplayTimes : orderedDisplayTimes.slice(0, INITIAL_VISIBLE_SLOTS)),
    [orderedDisplayTimes, showAllTimes],
  );
  const selectedTime = useMemo(() => (locked && locked.date === selectedDate ? locked.time : null), [locked, selectedDate]);

  useEffect(() => {
    if (!locked || locked.date !== selectedDate || !selectedTime) return;
    const nextPrice = getLockedBookingDisplayPrice(locked);
    const prevPrice = prevTrackedPriceRef.current;
    if (prevPrice != null && prevPrice !== nextPrice) {
      trackGrowthEvent("price_updated", {
        from: prevPrice,
        to: nextPrice,
        reason: "time_selection",
      });
    }
    prevTrackedPriceRef.current = nextPrice;
  }, [locked, selectedDate, selectedTime]);

  const isTeamService =
    isTeamServiceType(lockBaseState?.service_type) || isTeamServiceType(lockBaseState?.service);

  const cleanerSlotTime = selectedTime ?? strategyRecommendedTime ?? "09:00";
  const { cleaners: cleanerPool, recommendedCleaner, loading: cleanersLoading, error: cleanersError } = useCleaners({
    selectedDate,
    selectedTime: cleanerSlotTime,
    durationMinutes: durationMinutesForApi,
    enabled: !isTeamService,
  });

  useEffect(() => {
    if (!isTeamService) return;
    setAutoAssignCleaner(true);
    clearSelectedCleanerFromStorage();
  }, [isTeamService, selectedDate, selectedTime]);

  const continueLabel = locked ? bookingCopy.when.cta : "Select a time";
  const canContinue = isTeamService ? locked != null : locked != null && (autoAssignCleaner || !!selectedCleaner);

  const stickyBar = useMemo(() => {
    if (!lockBaseState) return undefined;
    if (locked) {
      const totalZar = getLockedBookingDisplayPrice(locked);
      return {
        totalZar,
        compareFromZar: canonicalTotalZar != null && canonicalTotalZar > totalZar ? canonicalTotalZar : null,
        totalCaption: "Final price",
        ctaShort: "Continue →",
        openSummarySheetOnAmountTap: true,
      };
    }
    return {
      totalZar: canonicalTotalZar ?? 0,
      totalCaption: "Estimated price (before time selection)",
      amountDisplayOverride: canonicalTotalZar == null ? "Select a time" : null,
      ctaShort: "Continue →",
      openSummarySheetOnAmountTap: true,
    };
  }, [lockBaseState, locked, canonicalTotalZar]);

  const handleSelectSlot = useCallback(
    async (time: string, opts?: { fromAutoPick?: boolean }) => {
      if (!lockBaseState || !catalog || !pricingJob) return;
      const rawSlot = rawSlots.find((s) => s.time === time);
      if (!rawSlot?.available) return;
      const exactEntry = quoteSlotPriceExact(rawSlot, pricingJob, catalog, vipTier, pricingFingerprint);
      setSlotPrices((prev) => ({ ...prev, [time]: exactEntry }));
      const cleanersCount = Math.max(0, Math.round(rawSlot.cleanersCount));
      const body = JSON.stringify({
        service: lockBaseState.service,
        service_type: lockBaseState.service_type,
        rooms: lockBaseState.rooms,
        bathrooms: lockBaseState.bathrooms,
        extraRooms: lockBaseState.extraRooms,
        extras: lockBaseState.extras,
        date: selectedDate,
        time,
        cleanersCount,
        vipTier,
      });
      let lastErr = "Could not lock this time.";
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch("/api/booking/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          errorCode?: string;
          pricingVersion?: number;
          pricing_version_id?: string;
          total?: number;
          hours?: number;
          surgeMultiplier?: number;
          surgeApplied?: boolean;
          surgeLabel?: string;
          signature?: string;
          lockExpiresAt?: string;
          extras_line_items?: { slug: string; name: string; price: number }[];
          breakdown?: {
            subtotalZar?: number;
            afterVipSubtotalZar?: number;
            vipSavingsZar?: number;
          };
        };
        lastErr = typeof json.error === "string" ? json.error : lastErr;
        if (json.errorCode === CONFIG_MISSING_BOOKING_LOCK_HMAC) {
          lastErr = CONFIG_MISSING_BOOKING_LOCK_HMAC;
          break;
        }
        if (
          res.ok &&
          json.ok === true &&
          typeof json.total === "number" &&
          typeof json.hours === "number" &&
          typeof json.signature === "string" &&
          /^[0-9a-f]{64}$/i.test(json.signature) &&
          typeof json.lockExpiresAt === "string" &&
          json.lockExpiresAt.trim()
        ) {
          const b = json.breakdown;
          try {
            lockBookingSlot(lockBaseState, { date: selectedDate, time }, {
              vipTier,
              lockedQuote: {
                total: json.total,
                hours: json.hours,
                surge: Number(json.surgeMultiplier ?? 1),
                surgeLabel: json.surgeLabel ?? (json.surgeApplied ? "High demand" : "Standard"),
                cleanersCount,
                quoteSubtotalZar: typeof b?.subtotalZar === "number" ? b.subtotalZar : undefined,
                quoteAfterVipSubtotalZar: typeof b?.afterVipSubtotalZar === "number" ? b.afterVipSubtotalZar : undefined,
                quoteVipSavingsZar: typeof b?.vipSavingsZar === "number" ? b.vipSavingsZar : undefined,
                quoteSignature: json.signature,
                lockExpiresAt: json.lockExpiresAt,
                pricingVersion: typeof json.pricingVersion === "number" ? json.pricingVersion : undefined,
                pricing_version_id:
                  typeof json.pricing_version_id === "string" && json.pricing_version_id.trim()
                    ? json.pricing_version_id.trim()
                    : undefined,
                extras_line_items: Array.isArray(json.extras_line_items) ? json.extras_line_items : undefined,
              },
            });
          } catch {
            setSlotHint("We couldn’t save your slot. Check that site data is allowed, then try again.");
            return;
          }
          return;
        }
        if (attempt < 3) await sleep(400 * (attempt + 1));
      }
      trackBookingFunnelEvent("datetime", "error", {
        message: lastErr,
        action: "lock_slot",
        time,
        date: selectedDate,
      });
      if (opts?.fromAutoPick) lockFailedTimeKeysRef.current.add(`${selectedDate}|${time}`);
      autoLockRunRef.current = "";
      if (lastErr === CONFIG_MISSING_BOOKING_LOCK_HMAC) {
        setSlotHint(
          "Booking confirmation is temporarily unavailable. Please try again in a few minutes, or contact us if this keeps happening.",
        );
        return;
      }
      setSlotHint("That time may have just been taken — we refreshed the list. Pick another slot below.");
      forceAvailabilityRefresh();
    },
    [lockBaseState, rawSlots, selectedDate, vipTier, forceAvailabilityRefresh, catalog, pricingJob, pricingFingerprint],
  );

  useEffect(() => {
    if (!lockBaseState || slotsLoading || slotPricesPending || orderedDisplayTimes.length === 0) return;
    if (locked?.date === selectedDate && locked.time) return;
    const rec = strategyRecommendedTime;
    if (!rec || !orderedDisplayTimes.includes(rec)) return;
    if (lockFailedTimeKeysRef.current.has(`${selectedDate}|${rec}`)) return;
    const key = `${selectedDate}|${rec}`;
    if (autoLockRunRef.current === key) return;
    autoLockRunRef.current = key;
    void handleSelectSlot(rec, { fromAutoPick: true });
  }, [
    lockBaseState,
    slotsLoading,
    slotPricesPending,
    orderedDisplayTimes,
    strategyRecommendedTime,
    selectedDate,
    locked?.date,
    locked?.time,
    handleSelectSlot,
  ]);

  const slotRowByTime = useMemo(() => new Map(slotPickRows.map((r) => [r.time, r])), [slotPickRows]);

  const slotCardProps = useCallback(
    (time: string) => {
      const entry = slotPrices[time];
      const priceZar =
        entry && typeof entry.price === "number" && Number.isFinite(entry.price) ? entry.price : null;
      const isEstimated = Boolean(entry?.isEstimated);
      const row = slotRowByTime.get(time);
      const raw = rawSlots.find((s) => s.time === time);
      const strategyBadge = row
        ? slotStrategyBadge(time, strategyRecommendedTime, strategyMinPrice, row)
        : null;
      return {
        time,
        priceZar,
        isEstimated,
        cleanersCount: raw?.cleanersCount ?? row?.cleanersCount ?? 0,
        strategyBadge,
        selected: selectedTime === time,
      };
    },
    [slotPrices, slotRowByTime, strategyRecommendedTime, strategyMinPrice, selectedTime, rawSlots],
  );

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
      scheduleDateHint={scheduleDateHint}
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
          {isToday && windowedAvailableSlots.length > 0 && windowedAvailableSlots.length <= 4 ? (
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300/90" role="status">
              {bookingCopy.when.spotsLeftToday(windowedAvailableSlots.length)}
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
                <div className="space-y-2" role="status" aria-live="polite">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Checking availability…</p>
                  {canonicalTotalZar != null ? (
                    <p className="text-sm font-medium tabular-nums text-zinc-500 opacity-70 dark:text-zinc-400">
                      Current estimate: R {canonicalTotalZar.toLocaleString("en-ZA")}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
                    ))}
                  </div>
                </div>
              ) : null}
              {!slotsLoading && slotPricesPending && chronologicalDisplayTimes.length > 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
                  Checking prices…
                </p>
              ) : null}
              {!slotsLoading && chronologicalDisplayTimes.length > 0 ? (
                <AvailabilityMessage slots={chronologicalDisplayTimes.map((t) => ({ time: t }))} showExactTime />
              ) : null}
              {slotHint ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/95 p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">
                  <p>{slotHint}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => forceAvailabilityRefresh()}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950"
                    >
                      Refresh times
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = tomorrowYmd(allDateValues);
                        if (tomorrow) setDateOverride(tomorrow);
                      }}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      Next day’s slots
                    </button>
                  </div>
                </div>
              ) : null}

              {!slotsLoading && orderedDisplayTimes.length === 0 ? (
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
                    <p className="font-medium">{nextAvailableHint(allDateValues, selectedDate)}</p>
                  </div>
                )
              ) : null}

              {orderedDisplayTimes.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {visibleSlotTimes.map((time) => {
                    const p = slotCardProps(time);
                    const slotPrice = p.priceZar;
                    const anchorPrice =
                      canonicalTotalZar != null && Number.isFinite(canonicalTotalZar) && canonicalTotalZar > 0
                        ? canonicalTotalZar
                        : null;
                    const hasComparison = anchorPrice != null && slotPrice != null;
                    const diff = hasComparison ? anchorPrice - slotPrice : 0;
                    const percent = hasComparison ? Math.round((diff / anchorPrice) * 100) : 0;
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
                    const priceReady = p.priceZar != null;
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={!priceReady}
                        aria-busy={!priceReady}
                        onClick={() => {
                          if (!priceReady) return;
                          void handleSelectSlot(time);
                        }}
                        className={[
                          "min-w-0 w-full rounded-xl border p-3 text-left transition sm:p-3.5",
                          !priceReady ? "cursor-wait opacity-90" : "",
                          p.selected
                            ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 shrink-0">
                            <div className="text-sm font-medium tabular-nums sm:text-base">{p.time}</div>
                          </div>
                          <div className="min-w-0 text-right">
                            {hasComparison ? (
                              <p className="text-xs tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                                R {anchorPrice.toLocaleString("en-ZA")}
                              </p>
                            ) : null}
                            <div className="text-base font-semibold tabular-nums sm:text-lg">
                              {p.priceZar != null ? (
                                `R ${p.priceZar.toLocaleString("en-ZA")}`
                              ) : (
                                <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">Checking price…</span>
                              )}
                            </div>
                            {p.priceZar != null && p.isEstimated ? (
                              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                                Estimated price
                              </p>
                            ) : null}
                            {p.selected ? (
                              <p className="mt-0.5 text-xs font-medium text-blue-600 dark:text-blue-300">Selected</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-1 min-h-[1rem]">
                          {hasComparison && diff > 0 ? (
                            <p className="text-xs font-medium text-green-600 dark:text-green-400">
                              ✔ Save R {Math.abs(diff).toLocaleString("en-ZA")} ({Math.abs(percent)}%)
                            </p>
                          ) : hasComparison && diff < 0 ? (
                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
                              ⚡ Peak time pricing (+{Math.abs(percent)}%)
                            </p>
                          ) : (
                            <div className={["text-xs font-medium", badgeClass].join(" ")}>{badge ?? "—"}</div>
                          )}
                        </div>
                        {badgeHint ? (
                          <p className="mt-0.5 text-[11px] font-normal leading-snug text-zinc-500 dark:text-zinc-400">
                            {badgeHint}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                  </div>
                  {orderedDisplayTimes.length > INITIAL_VISIBLE_SLOTS && !showAllTimes ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTimes(true)}
                      className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      {bookingCopy.when.seeMoreTimes}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {locked && locked.date === selectedDate && selectedTime ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Final price and savings are shown directly on each slot card for easier comparison.
                </p>
              ) : null}

              {selectedTime && isTeamService ? (
                <section className="space-y-3" aria-labelledby="team-assignment-heading">
                  <h2 id="team-assignment-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Your cleaning team
                  </h2>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">A professional team will be assigned automatically.</p>
                    <ul className="mt-2 space-y-1">
                      <li>✓ Trained for deep and move cleaning jobs</li>
                      <li>✓ Fully equipped for full-service cleaning</li>
                      <li>✓ Selected based on availability and performance</li>
                    </ul>
                  </div>
                </section>
              ) : null}

              {selectedTime && !isTeamService ? (
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
                                {c.review_count > 0 ? ` · ${c.review_count} reviews` : ""}
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
