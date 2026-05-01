"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { AvailabilityMessage } from "@/components/booking/AvailabilityMessage";
import { BOOKING_CALENDAR_DAYS, generateNextDates } from "@/components/booking/BookingDateStrip";
import { prefetchBookingCleaners, useCleaners } from "@/components/booking/useCleaners";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { bookingCopy } from "@/lib/booking/copy";
import {
  clearSelectedCleanerFromStorage,
  readSelectedCleanerFromStorage,
  writeSelectedCleanerToStorage,
} from "@/lib/booking/cleanerSelection";
import { buildUiCleaners } from "@/lib/booking/cleanerSelectionConversion";
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
  buildUiSlots,
  computeBestValueCallout,
  defaultPickTimeFromUiSlots,
  formatNextAvailableSlotLine,
  formatSlotPriceGainLine,
  orderTimesForConversionGrid,
  readScheduleDefaultPickVariant,
  readScheduleVisibleSlotCap,
  timeDaypartLabel,
} from "@/lib/booking/scheduleSlotConversion";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { ScheduleUpsellBar } from "@/components/booking/ScheduleUpsellBar";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import { useBookingAvailabilityArea } from "@/components/booking/useBookingAvailabilityArea";
import { bookingExtrasClientLimitMessage, bookingExtrasOverClientLimit } from "@/lib/booking/bookingExtrasLimits";

const AVAILABILITY_SLOT_CACHE_TTL_MS = 50_000;
const availabilitySlotCache = new Map<string, { slots: RawAvailabilitySlot[]; at: number }>();

/** Default cap before “see more”; override with `NEXT_PUBLIC_SCHEDULE_VISIBLE_SLOTS`. */
const VISIBLE_SLOT_FALLBACK = 7;
/** Alternatives shown before “Show more cleaners” inside “Choose a different cleaner” (client UX only). */
const CLEANER_ALT_INITIAL_VISIBLE = 3;

function cleanerVisibleCardCount(args: {
  autoAssign: boolean;
  poolLen: number;
  alternativesOpen: boolean;
  showAllAlternatives: boolean;
  altLen: number;
}): number {
  if (args.poolLen === 0) return 0;
  if (args.autoAssign) return 1;
  if (!args.alternativesOpen) return 1;
  if (args.showAllAlternatives) return args.poolLen;
  return 1 + Math.min(CLEANER_ALT_INITIAL_VISIBLE, args.altLen);
}
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
  const { locationId: resolvedLocationId, cityId: resolvedCityId } = useBookingAvailabilityArea({
    serviceAreaLocationId: lockBaseState?.serviceAreaLocationId,
    serviceAreaCityId: lockBaseState?.serviceAreaCityId,
    locationLabel: lockBaseState?.location,
    allowFreeTextFallback: lockBaseState?.allowLocationTextFallback === true,
  });

  const [rawSlots, setRawSlots] = useState<RawAvailabilitySlot[]>([]);
  const [slotPrices, setSlotPrices] = useState<Record<string, SlotPriceEntry>>({});
  const [slotPricesPending, setSlotPricesPending] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotHint, setSlotHint] = useState<string | null>(null);
  const [slotFetchNonce, setSlotFetchNonce] = useState(0);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [showDeferredExpensive, setShowDeferredExpensive] = useState(false);
  const [autoAssignCleaner, setAutoAssignCleaner] = useState(false);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);
  const cleanerDefaultAppliedForLockRef = useRef<string>("");
  const cleanerPremiumSeenForLockRef = useRef<string>("");
  const cleanerPoolReadyAtRef = useRef<number | null>(null);
  const lastExplicitCleanerSelectionRef = useRef<{ id: string; rank: number } | null>(null);
  const autoLockRunRef = useRef<string>("");
  const prevTrackedPriceRef = useRef<number | null>(null);
  const skipAvailabilityCacheOnceRef = useRef(false);
  const lockFailedTimeKeysRef = useRef<Set<string>>(new Set());
  /** Time last auto-selected by the schedule step; cleared after user picks a different slot (analytics). */
  const suggestedSlotAfterAutoRef = useRef<string | null>(null);
  const slotsGridReadyAtRef = useRef<number | null>(null);
  const defaultPickVisibleAtRef = useRef<number | null>(null);
  const defaultPickCardRef = useRef<HTMLButtonElement | null>(null);
  const scheduleAbVariantRef = useRef(readScheduleDefaultPickVariant());
  const visibleSlotCap = useMemo(() => readScheduleVisibleSlotCap(VISIBLE_SLOT_FALLBACK), []);
  const [viewportCompact, setViewportCompact] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setViewportCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const visibleSlotCapEffective = viewportCompact ? Math.min(4, visibleSlotCap) : visibleSlotCap;

  const [todayTick, setTodayTick] = useState(0);

  const [lockConfirmPhase, setLockConfirmPhase] = useState<"idle" | "checking" | "confirmed">("idle");
  const [lockingTime, setLockingTime] = useState<string | null>(null);
  const [showCommitmentNudge, setShowCommitmentNudge] = useState(false);

  const allDateValues = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value), []);
  const lockedDateInRange = locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const isToday = selectedDate === ymdTodayLocal();
  const nowPlusOneHour = useMemo(() => {
    void todayTick;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + 60;
  }, [selectedDate, todayTick]);

  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => setTodayTick((t) => t + 1), 45_000);
    return () => window.clearInterval(id);
  }, [isToday]);
  /** Recomputed when date or slot data changes — used only for conversion scoring (client). */
  const nowMinutes = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, [selectedDate, rawSlots, slotPrices]);
  const clientHour = useMemo(() => new Date().getHours(), [selectedDate, rawSlots, slotPrices]);

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
    availabilitySlotCache.delete(`${selectedDate}|${durationMinutesForApi}|${resolvedLocationId ?? ""}`);
    setSlotFetchNonce((n) => n + 1);
  }, [selectedDate, durationMinutesForApi, resolvedLocationId]);

  const durationLine = useMemo(() => {
    if (canonicalDurationHours != null) return formatDurationLine(canonicalDurationHours);
    return "";
  }, [canonicalDurationHours]);

  const scheduleDateHint = useMemo(() => formatScheduleDateHint(selectedDate), [selectedDate]);

  useEffect(() => {
    setShowAllTimes(false);
    setShowDeferredExpensive(false);
    setSlotHint(null);
    lockFailedTimeKeysRef.current = new Set();
    suggestedSlotAfterAutoRef.current = null;
    slotsGridReadyAtRef.current = null;
    defaultPickVisibleAtRef.current = null;
    setLockConfirmPhase("idle");
    setLockingTime(null);
    setShowCommitmentNudge(false);
  }, [selectedDate]);

  useEffect(() => {
    autoLockRunRef.current = "";
  }, [selectedDate, pricingFingerprint]);

  useEffect(() => {
    if (!lockBaseState) return;
    const cacheKey = `${selectedDate}|${durationMinutesForApi}|${resolvedLocationId ?? ""}`;
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
        if (resolvedLocationId) params.set("locationId", resolvedLocationId);
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
  }, [lockBaseState, selectedDate, durationMinutesForApi, resolvedLocationId, slotFetchNonce]);

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

  const scheduleSlotInputs = useMemo(() => {
    return windowedAvailableSlots.map((s) => {
      const entry = slotPrices[s.time];
      const price = entry && typeof entry.price === "number" && Number.isFinite(entry.price) ? entry.price : null;
      return {
        time: s.time,
        price,
        cleanersCount: s.cleanersCount ?? 0,
        isEstimated: Boolean(entry?.isEstimated),
      };
    });
  }, [windowedAvailableSlots, slotPrices]);

  const uiSlots = useMemo(
    () =>
      buildUiSlots(scheduleSlotInputs, {
        isToday,
        nowMinutes,
        clientHour,
        selectedDateYmd: selectedDate,
        todayYmd: ymdTodayLocal(),
      }),
    [scheduleSlotInputs, isToday, nowMinutes, clientHour, selectedDate],
  );

  const uiSlotByTime = useMemo(() => new Map(uiSlots.map((s) => [s.time, s])), [uiSlots]);

  const gridMinPrice = useMemo(() => {
    const fp = uiSlots.map((s) => s.price).filter((p): p is number => p != null && Number.isFinite(p));
    return fp.length > 0 ? Math.min(...fp) : 0;
  }, [uiSlots]);

  const gridMaxPrice = useMemo(() => {
    const fp = uiSlots.map((s) => s.price).filter((p): p is number => p != null && Number.isFinite(p));
    return fp.length > 0 ? Math.max(...fp) : 0;
  }, [uiSlots]);

  const bestValueCallout = useMemo(() => computeBestValueCallout(uiSlots, gridMinPrice), [uiSlots, gridMinPrice]);

  const defaultPickTime = useMemo(
    () => defaultPickTimeFromUiSlots(uiSlots, scheduleAbVariantRef.current),
    [uiSlots],
  );

  const orderedDisplayTimes = useMemo(() => {
    if (uiSlots.length === 0) return chronologicalDisplayTimes;
    return orderTimesForConversionGrid(uiSlots);
  }, [uiSlots, chronologicalDisplayTimes]);

  const priceyThreshold = gridMinPrice > 0 ? gridMinPrice * 1.2 : null;
  const { primaryDisplayTimes, deferredDisplayTimes } = useMemo(() => {
    if (priceyThreshold == null) {
      return { primaryDisplayTimes: orderedDisplayTimes, deferredDisplayTimes: [] as string[] };
    }
    const primary: string[] = [];
    const deferred: string[] = [];
    for (const t of orderedDisplayTimes) {
      const pr = uiSlotByTime.get(t)?.price;
      if (pr == null) primary.push(t);
      else if (pr <= priceyThreshold) primary.push(t);
      else deferred.push(t);
    }
    if (primary.length === 0 && deferred.length > 0) {
      return { primaryDisplayTimes: orderedDisplayTimes, deferredDisplayTimes: [] as string[] };
    }
    return { primaryDisplayTimes: primary, deferredDisplayTimes: deferred };
  }, [orderedDisplayTimes, uiSlotByTime, priceyThreshold]);

  const combinedDisplayTimes = useMemo(
    () => (showDeferredExpensive ? [...primaryDisplayTimes, ...deferredDisplayTimes] : primaryDisplayTimes),
    [primaryDisplayTimes, deferredDisplayTimes, showDeferredExpensive],
  );

  const visibleSlotTimes = useMemo(
    () => (showAllTimes ? combinedDisplayTimes : combinedDisplayTimes.slice(0, visibleSlotCapEffective)),
    [combinedDisplayTimes, showAllTimes, visibleSlotCapEffective],
  );

  const maxCleanersInGrid = useMemo(() => {
    const counts = windowedAvailableSlots.map((s) => s.cleanersCount ?? 0);
    return counts.length === 0 ? 0 : Math.max(...counts);
  }, [windowedAvailableSlots]);

  useEffect(() => {
    if (slotsLoading || slotPricesPending || orderedDisplayTimes.length === 0) return;
    if (slotsGridReadyAtRef.current == null) slotsGridReadyAtRef.current = Date.now();
  }, [slotsLoading, slotPricesPending, orderedDisplayTimes.length]);

  useEffect(() => {
    if (!defaultPickTime || orderedDisplayTimes.length === 0) return;
    if (defaultPickVisibleAtRef.current == null) defaultPickVisibleAtRef.current = Date.now();
  }, [defaultPickTime, orderedDisplayTimes.length]);

  useEffect(() => {
    if (!defaultPickTime || typeof IntersectionObserver === "undefined") return;
    const el = defaultPickCardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        const lockedOther =
          locked && locked.date === selectedDate && locked.time && locked.time !== defaultPickTime;
        if (lockedOther) {
          setShowCommitmentNudge(false);
          return;
        }
        if (!e.isIntersecting && e.boundingClientRect.top < 80) setShowCommitmentNudge(true);
        else if (e.isIntersecting) setShowCommitmentNudge(false);
      },
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [defaultPickTime, locked, selectedDate]);

  useEffect(() => {
    if (lockConfirmPhase === "checking") return;
    if (locked?.date === selectedDate && locked?.time) setLockConfirmPhase("confirmed");
  }, [locked?.date, locked?.time, selectedDate, lockConfirmPhase]);
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

  useEffect(() => {
    if (!defaultPickTime || deferredDisplayTimes.length === 0) return;
    if (deferredDisplayTimes.includes(defaultPickTime)) setShowDeferredExpensive(true);
  }, [defaultPickTime, deferredDisplayTimes]);

  useEffect(() => {
    if (!lockBaseState || isTeamService || !defaultPickTime || !selectedDate) return;
    void prefetchBookingCleaners({
      selectedDate,
      selectedTime: defaultPickTime,
      durationMinutes: durationMinutesForApi,
      locationId: resolvedLocationId ?? null,
    });
  }, [lockBaseState, isTeamService, defaultPickTime, selectedDate, durationMinutesForApi, resolvedLocationId]);

  const cleanerSlotTime = selectedTime ?? defaultPickTime ?? "09:00";
  const { cleaners: cleanerPool, loading: cleanersLoading, error: cleanersError } = useCleaners({
    selectedDate,
    selectedTime: cleanerSlotTime,
    durationMinutes: durationMinutesForApi,
    locationId: resolvedLocationId,
    enabled: !isTeamService,
  });

  const uiCleaners = useMemo(() => buildUiCleaners(cleanerPool), [cleanerPool]);
  const recommendedUi = uiCleaners[0] ?? null;
  const alternativeCleaners = useMemo(() => uiCleaners.slice(1), [uiCleaners]);
  const premiumUpgradeTarget = useMemo(() => uiCleaners.find((u) => u.isPremium) ?? null, [uiCleaners]);
  const selectedUiCleaner = useMemo(
    () => (selectedCleaner ? uiCleaners.find((u) => u.id === selectedCleaner.id) ?? null : null),
    [selectedCleaner, uiCleaners],
  );

  const getVisibleCleanerCount = useCallback(() => {
    return cleanerVisibleCardCount({
      autoAssign: autoAssignCleaner,
      poolLen: cleanerPool.length,
      alternativesOpen,
      showAllAlternatives,
      altLen: alternativeCleaners.length,
    });
  }, [autoAssignCleaner, cleanerPool.length, alternativesOpen, showAllAlternatives, alternativeCleaners.length]);

  useEffect(() => {
    setShowAllAlternatives(false);
    setAlternativesOpen(false);
  }, [locked?.date, locked?.time, cleanerSlotTime]);

  useEffect(() => {
    if (cleanersLoading) return;
    cleanerPoolReadyAtRef.current = Date.now();
  }, [cleanersLoading, cleanerSlotTime, selectedDate, locked?.date, locked?.time]);

  useEffect(() => {
    if (isTeamService || !locked || cleanersLoading || !recommendedUi?.isPremium) return;
    const lockKey = `${locked.date}|${locked.time}`;
    if (cleanerPremiumSeenForLockRef.current === lockKey) return;
    cleanerPremiumSeenForLockRef.current = lockKey;
    trackBookingFunnelEvent("datetime", "next", {
      action: "cleaner_premium_seen",
      cleaner_id: recommendedUi.id,
      rank: recommendedUi.rank,
      is_premium: true,
      badges: recommendedUi.badges.join(","),
      price_delta: recommendedUi.priceDelta,
    });
  }, [isTeamService, locked, cleanersLoading, recommendedUi]);

  useEffect(() => {
    if (isTeamService || !locked || cleanersLoading) return;
    const lockKey = `${locked.date}|${locked.time}`;

    if (cleanerPool.length === 0) {
      setAutoAssignCleaner(true);
      clearSelectedCleanerFromStorage();
      cleanerDefaultAppliedForLockRef.current = "";
      return;
    }

    if (cleanerDefaultAppliedForLockRef.current === lockKey) return;

    const stored = readSelectedCleanerFromStorage();
    if (stored && cleanerPool.some((c) => c.id === stored.id)) {
      setAutoAssignCleaner(false);
      mergeCleanerIdIntoLockedBooking(stored.id);
      cleanerDefaultAppliedForLockRef.current = lockKey;
      lastExplicitCleanerSelectionRef.current = {
        id: stored.id,
        rank: uiCleaners.find((u) => u.id === stored.id)?.rank ?? 1,
      };
      return;
    }

    const top = uiCleaners[0];
    if (!top) return;

    setAutoAssignCleaner(false);
    writeSelectedCleanerToStorage({ id: top.id, name: top.name });
    mergeCleanerIdIntoLockedBooking(top.id);
    cleanerDefaultAppliedForLockRef.current = lockKey;
    lastExplicitCleanerSelectionRef.current = { id: top.id, rank: top.rank };
    trackBookingFunnelEvent("datetime", "next", {
      action: "cleaner_default_selected",
      cleaner_id: top.id,
      rank: 1,
      is_recommended: top.isRecommended,
      is_premium: top.isPremium,
      badges: top.badges.join(","),
      price_delta: top.priceDelta,
      visible_count: 1,
    });
    if (top.isPremium) {
      trackBookingFunnelEvent("datetime", "next", {
        action: "cleaner_premium_selected",
        cleaner_id: top.id,
        rank: top.rank,
        is_premium: true,
        badges: top.badges.join(","),
        price_delta: top.priceDelta,
        source: "default",
      });
    }
  }, [isTeamService, locked, cleanersLoading, cleanerPool, uiCleaners]);

  useEffect(() => {
    if (!isTeamService) return;
    setAutoAssignCleaner(true);
    clearSelectedCleanerFromStorage();
  }, [isTeamService, selectedDate, selectedTime]);

  const continueLabel =
    locked && locked.date === selectedDate && locked.time
      ? `Continue with ${locked.time}`
      : locked
        ? bookingCopy.when.cta
        : "Select a time";
  const canContinue = isTeamService ? locked != null : locked != null && (autoAssignCleaner || !!selectedCleaner);

  const stickyBar = useMemo(() => {
    if (!lockBaseState) return undefined;
    const mobileHoursLine = locked
      ? formatBookingHoursCompact(locked.finalHours)
      : canonicalDurationHours != null
        ? formatBookingHoursCompact(canonicalDurationHours)
        : null;
    if (locked) {
      const totalZar = getLockedBookingDisplayPrice(locked);
      const ctaTime =
        locked.date === selectedDate && locked.time ? `Continue with ${locked.time}` : "Continue →";
      return {
        totalZar,
        compareFromZar: canonicalTotalZar != null && canonicalTotalZar > totalZar ? canonicalTotalZar : null,
        totalCaption: "Final price",
        mobileHoursLine,
        ctaShort: ctaTime,
        openSummarySheetOnAmountTap: true,
      };
    }
    return {
      totalZar: canonicalTotalZar ?? 0,
      totalCaption: "Estimated price (before time selection)",
      amountDisplayOverride: canonicalTotalZar == null ? "Select a time" : null,
      mobileHoursLine,
      ctaShort: "Continue →",
      openSummarySheetOnAmountTap: true,
    };
  }, [lockBaseState, locked, canonicalTotalZar, canonicalDurationHours, selectedDate]);

  const handleSelectSlot = useCallback(
    async (time: string, opts?: { fromAutoPick?: boolean }) => {
      if (!lockBaseState || !catalog || !pricingJob) return;
      if (bookingExtrasOverClientLimit(lockBaseState.extras)) {
        setLockConfirmPhase("idle");
        setLockingTime(null);
        setSlotHint(bookingExtrasClientLimitMessage());
        return;
      }
      const rawSlot = rawSlots.find((s) => s.time === time);
      if (!rawSlot?.available) return;
      setLockConfirmPhase("checking");
      setLockingTime(time);
      const exactEntry = quoteSlotPriceExact(rawSlot, pricingJob, catalog, vipTier, pricingFingerprint);
      setSlotPrices((prev) => ({ ...prev, [time]: exactEntry }));
      const cleanersCount = Math.max(0, Math.round(rawSlot.cleanersCount));
      const slotLocationId =
        typeof rawSlot.locationId === "string" && rawSlot.locationId.trim()
          ? rawSlot.locationId.trim()
          : resolvedLocationId;
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
        ...(resolvedLocationId
          ? {
              locationId: resolvedLocationId,
              ...(slotLocationId ? { slotLocationId } : {}),
              ...(resolvedCityId ? { cityId: resolvedCityId } : {}),
            }
          : {}),
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
            const uiMeta = uiSlotByTime.get(time);
            const switchedFromAutoDefault =
              !opts?.fromAutoPick &&
              suggestedSlotAfterAutoRef.current != null &&
              suggestedSlotAfterAutoRef.current !== time;
            if (opts?.fromAutoPick) suggestedSlotAfterAutoRef.current = time;
            else if (switchedFromAutoDefault) suggestedSlotAfterAutoRef.current = null;
            const tts = slotsGridReadyAtRef.current != null ? Date.now() - slotsGridReadyAtRef.current : null;
            const dvs =
              defaultPickVisibleAtRef.current != null ? Date.now() - defaultPickVisibleAtRef.current : null;
            trackBookingFunnelEvent("datetime", "next", {
              action: "slot_locked",
              auto_picked: opts?.fromAutoPick === true,
              switched_from_auto_default: switchedFromAutoDefault,
              time,
              position_index: orderedDisplayTimes.indexOf(time),
              slot_rank_clicked: orderedDisplayTimes.indexOf(time),
              slot_visible_count: combinedDisplayTimes.length,
              time_to_selection_ms: tts,
              default_visible_duration_ms: dvs,
              schedule_ab_variant: scheduleAbVariantRef.current,
              badges_shown: (uiMeta?.badges ?? []).join(","),
              price_delta_vs_min: uiMeta?.priceDelta ?? null,
              min_price_zar: gridMinPrice,
              max_price_zar: gridMaxPrice,
            });
            void prefetchBookingCleaners({
              selectedDate,
              selectedTime: time,
              durationMinutes: durationMinutesForApi,
              locationId: resolvedLocationId ?? null,
            });
            const minDelay = 160 + Math.floor(Math.random() * 140);
            await sleep(minDelay);
            setLockConfirmPhase("confirmed");
            setLockingTime(null);
          } catch {
            setSlotHint("We couldn’t save your slot. Check that site data is allowed, then try again.");
            setLockConfirmPhase("idle");
            setLockingTime(null);
            return;
          }
          return;
        }
        if (attempt < 3) await sleep(400 * (attempt + 1));
      }
      setLockConfirmPhase("idle");
      setLockingTime(null);
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
    [
      lockBaseState,
      rawSlots,
      selectedDate,
      vipTier,
      forceAvailabilityRefresh,
      catalog,
      pricingJob,
      pricingFingerprint,
      resolvedLocationId,
      resolvedCityId,
      uiSlotByTime,
      orderedDisplayTimes,
      combinedDisplayTimes,
      gridMinPrice,
      gridMaxPrice,
      durationMinutesForApi,
    ],
  );

  useEffect(() => {
    if (!lockBaseState || slotsLoading || slotPricesPending || orderedDisplayTimes.length === 0) return;
    if (locked?.date === selectedDate && locked.time) return;
    const pick = defaultPickTime;
    if (!pick || !orderedDisplayTimes.includes(pick)) return;
    if (lockFailedTimeKeysRef.current.has(`${selectedDate}|${pick}`)) return;
    const key = `${selectedDate}|${pick}`;
    if (autoLockRunRef.current === key) return;
    autoLockRunRef.current = key;
    void handleSelectSlot(pick, { fromAutoPick: true });
  }, [
    lockBaseState,
    slotsLoading,
    slotPricesPending,
    orderedDisplayTimes,
    defaultPickTime,
    selectedDate,
    locked?.date,
    locked?.time,
    handleSelectSlot,
  ]);

  const slotCardProps = useCallback(
    (time: string) => {
      const entry = slotPrices[time];
      const priceZar =
        entry && typeof entry.price === "number" && Number.isFinite(entry.price) ? entry.price : null;
      const isEstimated = Boolean(entry?.isEstimated);
      const raw = rawSlots.find((s) => s.time === time);
      const ui = uiSlotByTime.get(time);
      return {
        time,
        priceZar,
        isEstimated,
        cleanersCount: raw?.cleanersCount ?? ui?.cleanersCount ?? 0,
        ui,
        selected: selectedTime === time,
      };
    },
    [slotPrices, uiSlotByTime, selectedTime, rawSlots],
  );

  function selectCleaner(
    id: string,
    name: string,
    analytics?: {
      rank: number;
      badges: string[];
      isRecommended: boolean;
      isPremium?: boolean;
      priceDelta?: number | null;
      fromCard: boolean;
      visibleCount?: number;
    },
  ) {
    setAutoAssignCleaner(false);
    writeSelectedCleanerToStorage({ id, name });
    mergeCleanerIdIntoLockedBooking(id);
    if (!analytics?.fromCard) return;
    const t0 = cleanerPoolReadyAtRef.current;
    const durationMs = t0 != null ? Date.now() - t0 : null;
    const visibleCount =
      typeof analytics.visibleCount === "number" && Number.isFinite(analytics.visibleCount)
        ? Math.round(analytics.visibleCount)
        : null;
    const isPremium = analytics.isPremium === true;
    const priceDelta = analytics.priceDelta ?? null;
    const meta = {
      cleaner_id: id,
      rank: analytics.rank,
      is_recommended: analytics.isRecommended,
      is_premium: isPremium,
      badges: analytics.badges.join(","),
      price_delta: priceDelta,
      visible_count: visibleCount,
    };
    trackBookingFunnelEvent("datetime", "next", {
      action: "cleaner_position_clicked",
      ...meta,
      cleaner_selection_time_ms: durationMs,
    });
    if (durationMs != null) {
      trackBookingFunnelEvent("datetime", "next", {
        action: "cleaner_selection_time_ms",
        duration_ms: durationMs,
        ...meta,
      });
    }
    const prev = lastExplicitCleanerSelectionRef.current;
    if (prev != null && prev.id !== id) {
      trackBookingFunnelEvent("datetime", "next", {
        action: "cleaner_changed",
        from_cleaner_id: prev.id,
        to_cleaner_id: id,
        from_rank: prev.rank,
        to_rank: analytics.rank,
        is_recommended: analytics.isRecommended,
        is_premium: isPremium,
        badges: analytics.badges.join(","),
        price_delta: priceDelta,
        visible_count: visibleCount,
      });
    }
    if (isPremium) {
      trackBookingFunnelEvent("datetime", "next", {
        action: "cleaner_premium_selected",
        cleaner_id: id,
        rank: analytics.rank,
        is_premium: true,
        badges: analytics.badges.join(","),
        price_delta: priceDelta,
        visible_count: visibleCount,
        source: "click",
      });
    }
    lastExplicitCleanerSelectionRef.current = { id, rank: analytics.rank };
  }

  function enableAutoAssign() {
    setAutoAssignCleaner(true);
    clearSelectedCleanerFromStorage();
    lastExplicitCleanerSelectionRef.current = null;
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
      <div className="space-y-4 lg:space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{bookingCopy.when.title}</h1>
          <p className="mt-2 max-w-[576px] text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{bookingCopy.when.intro}</p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{bookingCopy.when.scheduleMicroBenefit}</p>
          {isToday && windowedAvailableSlots.length > 0 && windowedAvailableSlots.length <= 4 ? (
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300/90" role="status">
              {bookingCopy.when.spotsLeftToday(windowedAvailableSlots.length)}
            </p>
          ) : null}
          {lockBaseState && lockBaseState.extraRooms > 0 ? (
            <p className="mt-2 max-w-[576px] text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
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
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{bookingCopy.when.loadingAvailability}</p>
                  {canonicalTotalZar != null ? (
                    <p className="hidden text-sm font-medium tabular-nums text-zinc-500 opacity-70 dark:text-zinc-400 lg:block">
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
                    <p className="font-medium">{formatNextAvailableSlotLine(tomorrowYmd(allDateValues))}</p>
                    <p className="text-xs opacity-90">All times for today are gone — jump to the next day.</p>
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
                    <p className="font-medium">
                      {formatNextAvailableSlotLine(allDateValues.find((d) => d > selectedDate) ?? tomorrowYmd(allDateValues))}
                    </p>
                    <p className="text-xs opacity-90">{nextAvailableHint(allDateValues, selectedDate)}</p>
                  </div>
                )
              ) : null}

              {orderedDisplayTimes.length > 0 ? (
                <div className="space-y-3">
                  {resolvedLocationId ? (
                    <p className="text-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {bookingCopy.when.slotsFillQuicklyInArea}
                    </p>
                  ) : null}
                  {bestValueCallout ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                      <span aria-hidden>💡 </span>
                      {bestValueCallout.line}
                    </p>
                  ) : null}
                  {showCommitmentNudge && defaultPickTime ? (
                    <p className="rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2 text-center text-xs font-medium text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
                      {bookingCopy.when.mostPeopleChooseThisTime} ({defaultPickTime})
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
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
                    const gainLine = formatSlotPriceGainLine(p.priceZar, gridMinPrice, gridMaxPrice);
                    const daypart = timeDaypartLabel(time);
                    const rawAvail = Boolean(rawSlots.find((s) => s.time === time)?.available);
                    const pos = combinedDisplayTimes.indexOf(time);
                    const showRecForYou = Boolean(p.selected && defaultPickTime && time === defaultPickTime);
                    const isPeakSlot =
                      slotPrice != null &&
                      gridMaxPrice > 0 &&
                      gridMinPrice > 0 &&
                      gridMaxPrice > gridMinPrice &&
                      Math.round(slotPrice) === Math.round(gridMaxPrice);
                    const isFastestSlot =
                      maxCleanersInGrid > 0 && p.cleanersCount === maxCleanersInGrid && rawAvail;
                    const isDefaultHero =
                      defaultPickTime === time &&
                      (!selectedTime || selectedTime === defaultPickTime) &&
                      !(locked && locked.date === selectedDate && locked.time && locked.time !== defaultPickTime);
                    const checkingThis = lockConfirmPhase === "checking" && lockingTime === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        ref={time === defaultPickTime ? defaultPickCardRef : undefined}
                        disabled={!rawAvail}
                        aria-busy={p.priceZar == null}
                        onClick={() => {
                          if (!rawAvail) return;
                          const ttsTap = slotsGridReadyAtRef.current != null ? Date.now() - slotsGridReadyAtRef.current : null;
                          const dvsTap =
                            defaultPickVisibleAtRef.current != null ? Date.now() - defaultPickVisibleAtRef.current : null;
                          trackBookingFunnelEvent("datetime", "view", {
                            action: "slot_tap",
                            time,
                            position_index: pos,
                            slot_rank_clicked: pos,
                            slot_visible_count: combinedDisplayTimes.length,
                            time_to_selection_ms: ttsTap,
                            default_visible_duration_ms: dvsTap,
                            schedule_ab_variant: scheduleAbVariantRef.current,
                            is_default_pick_time: time === defaultPickTime,
                            badges_shown: (p.ui?.badges ?? []).join(","),
                            price_delta_vs_min: p.ui?.priceDelta ?? null,
                          });
                          void handleSelectSlot(time);
                        }}
                        className={[
                          "min-h-[5.25rem] min-w-0 w-full rounded-xl border p-3.5 text-left transition active:scale-[0.99] sm:min-h-[4.5rem] sm:p-3.5",
                          isDefaultHero
                            ? "min-h-[5.5rem] scale-[1.02] shadow-md ring-2 ring-blue-400/35 shadow-blue-500/10 sm:min-h-[5.35rem]"
                            : "",
                          p.priceZar == null ? "border-zinc-200/90 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/80" : "",
                          p.selected
                            ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 shrink-0">
                            <div className="text-base font-semibold tabular-nums sm:text-lg">{p.time}</div>
                            {daypart ? (
                              <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">— {daypart}</p>
                            ) : null}
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
                                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Tap to price & lock</span>
                              )}
                            </div>
                            {p.priceZar != null && p.isEstimated ? (
                              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                                Estimated price
                              </p>
                            ) : null}
                            {p.selected ? (
                              <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-200">Selected</p>
                            ) : null}
                            {showRecForYou ? (
                              <p className="mt-1 text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                                {bookingCopy.when.recommendedForYou}
                              </p>
                            ) : null}
                            {checkingThis ? (
                              <p className="mt-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                                {bookingCopy.when.checkingAvailabilityShort}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {isPeakSlot ? (
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-200/90">
                            {bookingCopy.when.peakTimeLabel}
                          </p>
                        ) : null}
                        {isFastestSlot ? (
                          <p className="mt-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-200/90">
                            {bookingCopy.when.fastestToConfirm}
                          </p>
                        ) : null}
                        {gainLine ? (
                          <p className="mt-1 text-[11px] font-medium tabular-nums text-emerald-800 dark:text-emerald-200/90">
                            {gainLine}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(p.ui?.badges ?? []).map((b, i) => (
                            <span
                              key={`${time}-${b}-${i}`}
                              className={[
                                "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                b === "Recommended"
                                  ? "bg-blue-100 text-blue-900 dark:bg-blue-950/80 dark:text-blue-100"
                                  : b === "Best price"
                                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100"
                                    : b === "High availability"
                                      ? "bg-sky-100 text-sky-950 dark:bg-sky-950/60 dark:text-sky-100"
                                      : b === "Limited"
                                        ? "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
                                        : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
                              ].join(" ")}
                            >
                              {b}
                            </span>
                          ))}
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
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  </div>
                  {deferredDisplayTimes.length > 0 && !showDeferredExpensive ? (
                    <button
                      type="button"
                      onClick={() => setShowDeferredExpensive(true)}
                      className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-600 dark:text-zinc-200"
                    >
                      {bookingCopy.when.showLaterTimes}
                    </button>
                  ) : null}
                  {combinedDisplayTimes.length > visibleSlotCapEffective && !showAllTimes ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTimes(true)}
                      className="w-full rounded-xl border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:border-blue-400 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      <span className="lg:hidden">More</span>
                      <span className="hidden lg:inline">{bookingCopy.when.seeMoreTimes}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {lockConfirmPhase === "confirmed" && locked && locked.date === selectedDate && selectedTime ? (
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200/90" role="status">
                  {bookingCopy.when.timeSelectedAvailabilityConfirmed}
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
                  <h2 id="cleaner-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Choose your cleaner
                  </h2>
                  <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {bookingCopy.cleaner.sectionIntro}
                  </p>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={enableAutoAssign}
                      className={[
                        "flex min-h-[3rem] w-full flex-col justify-center rounded-xl border px-4 py-3 text-left transition duration-200 active:scale-[0.99] md:min-h-[2.75rem]",
                        autoAssignCleaner
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-400/50 dark:bg-blue-950/40 dark:text-blue-50"
                          : "border-zinc-200 bg-white hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-600",
                      ].join(" ")}
                    >
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {bookingCopy.cleaner.assignAutomaticallyTitle}
                      </span>
                      <span className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {bookingCopy.cleaner.assignAutomaticallyHint}
                      </span>
                    </button>

                    {autoAssignCleaner && !cleanersLoading && cleanerPool.length > 0 ? (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {bookingCopy.cleaner.autoAssignOnlyHint}{" "}
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {bookingCopy.cleaner.tapToConfirmTopMatch}
                        </span>
                      </p>
                    ) : null}

                    {cleanersLoading ? (
                      <div className="flex flex-col gap-3">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div
                            key={i}
                            className="min-h-[11rem] w-full animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                          />
                        ))}
                      </div>
                    ) : cleanersError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                        <p>{cleanersError}</p>
                        <p className="mt-2 text-xs text-rose-700/90 dark:text-rose-300/90">
                          {bookingCopy.cleaner.emptyContinueHint}
                        </p>
                      </div>
                    ) : cleanerPool.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
                        <p className="font-medium">{bookingCopy.cleaner.emptyAssign}</p>
                        <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-200/90">
                          {bookingCopy.cleaner.emptyContinueHint}
                        </p>
                      </div>
                    ) : recommendedUi ? (
                      <>
                        {(() => {
                          const c = recommendedUi;
                          const isSelected = !autoAssignCleaner && selectedCleaner?.id === c.id;
                          const jobsLine =
                            c.completedJobs >= 100
                              ? `${c.completedJobs.toLocaleString("en-ZA")}+ jobs`
                              : `${c.completedJobs.toLocaleString("en-ZA")} jobs`;
                          const premiumGlow =
                            c.isPremium && !autoAssignCleaner
                              ? "shadow-[0_0_32px_-8px_rgba(99,102,241,0.4)] ring-1 ring-indigo-300/50 dark:shadow-[0_0_36px_-8px_rgba(129,140,248,0.35)] dark:ring-indigo-400/30"
                              : "";
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                if (autoAssignCleaner) {
                                  selectCleaner(c.id, c.name, {
                                    rank: c.rank,
                                    badges: c.badges,
                                    isRecommended: c.isRecommended,
                                    isPremium: c.isPremium,
                                    priceDelta: c.priceDelta,
                                    fromCard: true,
                                    visibleCount: 1,
                                  });
                                  return;
                                }
                                if (selectedCleaner?.id !== c.id) {
                                  selectCleaner(c.id, c.name, {
                                    rank: c.rank,
                                    badges: c.badges,
                                    isRecommended: c.isRecommended,
                                    isPremium: c.isPremium,
                                    priceDelta: c.priceDelta,
                                    fromCard: true,
                                    visibleCount: getVisibleCleanerCount(),
                                  });
                                }
                              }}
                              className={[
                                "relative flex min-h-[11rem] w-full origin-top flex-col rounded-xl border-2 px-4 py-4 text-left shadow-sm transition duration-200 active:scale-[1.01] max-lg:min-h-0 max-lg:px-3 max-lg:py-3 sm:min-h-[10.5rem]",
                                premiumGlow,
                                autoAssignCleaner
                                  ? "scale-100 border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                                  : [
                                      "max-lg:scale-100 scale-[1.02] sm:scale-[1.03]",
                                      isSelected
                                        ? "border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-400/50 dark:border-blue-500 dark:bg-blue-950/45 dark:text-blue-50 dark:ring-blue-500/35"
                                        : c.isPremium
                                          ? "border-indigo-400/90 bg-gradient-to-b from-indigo-50/95 via-blue-50/80 to-white dark:border-indigo-500/80 dark:from-indigo-950/50 dark:via-blue-950/35 dark:to-zinc-900"
                                          : "border-blue-400/90 bg-gradient-to-b from-blue-50/95 to-white dark:border-blue-600 dark:from-blue-950/40 dark:to-zinc-900",
                                    ].join(" "),
                              ].join(" ")}
                            >
                              {isSelected ? (
                                <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-blue-500">
                                  {bookingCopy.cleaner.selectedBadge}
                                </span>
                              ) : null}
                              <div className="flex items-start gap-3 pr-16">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-blue-900 shadow-inner dark:bg-zinc-800 dark:text-blue-100">
                                  {c.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={[
                                      "text-xs font-semibold",
                                      autoAssignCleaner ? "text-zinc-700 dark:text-zinc-200" : "text-blue-900 dark:text-blue-100",
                                    ].join(" ")}
                                  >
                                    {bookingCopy.cleaner.recommendedLabel}
                                  </p>
                                  {c.isPremium ? (
                                    <p className="mt-1 text-[11px] font-medium leading-snug text-indigo-900 dark:text-indigo-100">
                                      {bookingCopy.cleaner.premiumValue}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
                                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                    ⭐ {c.rating.toFixed(1)} · {jobsLine}
                                  </p>
                                  {c.priceDelta != null && c.priceDelta > 0 ? (
                                    <div className="mt-2 hidden lg:block">
                                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">
                                        {bookingCopy.cleaner.betterResultsLine}
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                                        {bookingCopy.cleaner.qualityRatedHigher}
                                      </p>
                                      <p className="mt-0.5 text-[11px] italic text-zinc-500 dark:text-zinc-500">
                                        {bookingCopy.cleaner.worthItLine}
                                      </p>
                                    </div>
                                  ) : null}
                                  <p className="mt-2 hidden text-[11px] font-medium leading-snug text-zinc-700 dark:text-zinc-300 lg:block">
                                    {bookingCopy.cleaner.trustLine}
                                  </p>
                                  {c.isPremium ? (
                                    <p className="mt-1 hidden text-[11px] text-zinc-600 dark:text-zinc-400 lg:block">
                                      {bookingCopy.cleaner.premiumSocialProof}
                                    </p>
                                  ) : null}
                                  {c.isPremium && c.showStrongDefaultBias ? (
                                    <p className="mt-1 hidden text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 lg:block">
                                      {bookingCopy.cleaner.mostCustomers}
                                    </p>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {c.badges.map((b, i) => (
                                      <span
                                        key={`${c.id}-${i}-${b}`}
                                        className={[
                                          "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                                          b === "Recommended"
                                            ? "bg-blue-100 uppercase text-blue-900 dark:bg-blue-950/80 dark:text-blue-100"
                                            : b === bookingCopy.cleaner.premiumBadge || b.includes("💎")
                                              ? "bg-gradient-to-r from-amber-50 to-indigo-50 font-bold text-indigo-950 ring-1 ring-amber-200/70 dark:from-amber-950/40 dark:to-indigo-950/40 dark:text-indigo-50 dark:ring-amber-700/40"
                                              : "bg-zinc-100 uppercase text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
                                        ].join(" ")}
                                      >
                                        {b}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })()}

                        {!autoAssignCleaner && alternativeCleaners.length > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setAlternativesOpen((o) => !o)}
                              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-600"
                              aria-expanded={alternativesOpen}
                            >
                              <span>{bookingCopy.cleaner.changeToggle}</span>
                              <ChevronDown
                                className={["h-5 w-5 shrink-0 text-zinc-500 transition", alternativesOpen ? "rotate-180" : ""].join(
                                  " ",
                                )}
                                aria-hidden
                              />
                            </button>
                            {alternativesOpen ? (
                              <div className="flex flex-col gap-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-600">
                                {(showAllAlternatives
                                  ? alternativeCleaners
                                  : alternativeCleaners.slice(0, CLEANER_ALT_INITIAL_VISIBLE)
                                ).map((c) => {
                                  const isSelected = selectedCleaner?.id === c.id;
                                  const jobsLine =
                                    c.completedJobs >= 100
                                      ? `${c.completedJobs.toLocaleString("en-ZA")}+ jobs`
                                      : `${c.completedJobs.toLocaleString("en-ZA")} jobs`;
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() =>
                                        selectCleaner(c.id, c.name, {
                                          rank: c.rank,
                                          badges: c.badges,
                                          isRecommended: c.isRecommended,
                                          isPremium: c.isPremium,
                                          priceDelta: c.priceDelta,
                                          fromCard: true,
                                          visibleCount: getVisibleCleanerCount(),
                                        })
                                      }
                                      className={[
                                        "relative flex min-h-[44px] w-full flex-col rounded-xl border px-4 py-3 text-left transition active:scale-[0.99]",
                                        isSelected
                                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/45"
                                          : c.isPremium
                                            ? "border-indigo-200/90 bg-indigo-50/40 hover:border-indigo-300 dark:border-indigo-800/60 dark:bg-indigo-950/25"
                                            : "border-zinc-200 bg-white hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900",
                                      ].join(" ")}
                                    >
                                      {isSelected ? (
                                        <span className="absolute right-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                                          {bookingCopy.cleaner.selectedBadge}
                                        </span>
                                      ) : null}
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                          {c.name.slice(0, 1).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
                                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                            ⭐ {c.rating.toFixed(1)} · {jobsLine}
                                          </p>
                                          <p className="mt-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                                            {c.isPremium ? bookingCopy.cleaner.premiumBadge : bookingCopy.cleaner.standardLabel}
                                          </p>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {c.badges.map((b, i) => (
                                              <span
                                                key={`${c.id}-${i}-${b}`}
                                                className={[
                                                  "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide",
                                                  b === bookingCopy.cleaner.premiumBadge || b.includes("💎")
                                                    ? "bg-gradient-to-r from-amber-50 to-indigo-50 font-bold text-indigo-950 ring-1 ring-amber-200/60 dark:from-amber-950/30 dark:to-indigo-950/30 dark:text-indigo-50"
                                                    : "bg-zinc-100 uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
                                                ].join(" ")}
                                              >
                                                {b}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                                {alternativeCleaners.length > CLEANER_ALT_INITIAL_VISIBLE && !showAllAlternatives ? (
                                  <button
                                    type="button"
                                    onClick={() => setShowAllAlternatives(true)}
                                    className="min-h-[44px] w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-zinc-600 dark:text-zinc-200"
                                  >
                                    {bookingCopy.cleaner.showMore}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}

                        {!autoAssignCleaner &&
                        premiumUpgradeTarget &&
                        selectedUiCleaner &&
                        !selectedUiCleaner.isPremium &&
                        selectedUiCleaner.id !== premiumUpgradeTarget.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              const to = premiumUpgradeTarget;
                              const fromId = selectedCleaner?.id ?? "";
                              trackBookingFunnelEvent("datetime", "next", {
                                action: "cleaner_upgrade_clicked",
                                from_id: fromId,
                                to_id: to.id,
                                is_premium: true,
                                badges: to.badges.join(","),
                                price_delta: to.priceDelta,
                              });
                              selectCleaner(to.id, to.name, {
                                rank: to.rank,
                                badges: to.badges,
                                isRecommended: to.isRecommended,
                                isPremium: to.isPremium,
                                priceDelta: to.priceDelta,
                                fromCard: true,
                                visibleCount: getVisibleCleanerCount(),
                              });
                            }}
                            className="w-full rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-left text-sm font-semibold text-indigo-950 transition hover:bg-indigo-100 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-50 dark:hover:bg-indigo-950/60"
                          >
                            {bookingCopy.cleaner.upgradePrompt}
                          </button>
                        ) : null}

                        {!autoAssignCleaner && selectedCleaner ? (
                          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200/90" role="status">
                            {bookingCopy.cleaner.selectedConfirm}
                          </p>
                        ) : null}
                      </>
                    ) : null}
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
