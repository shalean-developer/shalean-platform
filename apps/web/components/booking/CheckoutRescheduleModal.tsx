"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BOOKING_CALENDAR_DAYS, generateNextDates } from "@/components/booking/BookingDateStrip";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { bookingCopy } from "@/lib/booking/copy";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
import { lockedToStep1State, lockBookingSlot } from "@/lib/booking/lockedBooking";
import type { PricedAvailabilitySlot, RawAvailabilitySlot } from "@/lib/booking/enrichAvailabilitySlots";
import {
  minSlotPrice,
  orderSlotTimesForDisplay,
  pickRecommendedSlot,
  slotStrategyBadge,
  type SlotPickInput,
} from "@/lib/pricing/slotRevenueStrategy";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";

const INITIAL_VISIBLE_SLOTS = 9;
const SLOT_START_MIN = 7 * 60;
const SLOT_END_MIN = 18 * 60;

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

type LiveSlot = PricedAvailabilitySlot;

export type CheckoutRescheduleModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** After a new slot is locked successfully — e.g. clear checkout notice. */
  onLocked?: () => void;
};

export function CheckoutRescheduleModal({
  open,
  onOpenChange,
  title,
  description,
  onLocked,
}: CheckoutRescheduleModalProps) {
  const step1 = usePersistedBookingSummaryState();
  const locked = useLockedBooking();
  const { tier: vipTier } = useBookingVipTier();
  const { job: pricingJob, priceRawSlots, canonicalTotalZar, canonicalDurationHours } = useBookingPrice();

  const lockBaseState = step1 ?? (locked ? lockedToStep1State(locked) : null);

  const allDateValues = useMemo(() => generateNextDates(BOOKING_CALENDAR_DAYS).map((d) => d.value), []);
  const lockedDateInRange = locked?.date && allDateValues.includes(locked.date) ? locked.date : null;
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const selectedDate = dateOverride ?? lockedDateInRange ?? allDateValues[0]!;

  const [rawSlots, setRawSlots] = useState<RawAvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotHint, setSlotHint] = useState<string | null>(null);
  const [showAllTimes, setShowAllTimes] = useState(false);

  const isToday = selectedDate === ymdTodayLocal();
  const nowPlusOneHour = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + 60;
  }, [selectedDate]);

  const durationMinutesForApi = useMemo(() => {
    if (canonicalDurationHours != null) return Math.max(30, Math.round(canonicalDurationHours * 60));
    if (locked?.finalHours != null && Number.isFinite(locked.finalHours)) {
      return Math.max(30, Math.round(locked.finalHours * 60));
    }
    return 120;
  }, [canonicalDurationHours, locked?.finalHours]);

  useEffect(() => {
    if (!open) return;
    setDateOverride(null);
    setShowAllTimes(false);
    setSlotHint(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setShowAllTimes(false);
    setSlotHint(null);
  }, [open, selectedDate]);

  useEffect(() => {
    if (!slotHint) return;
    const t = window.setTimeout(() => setSlotHint(null), 5200);
    return () => window.clearTimeout(t);
  }, [slotHint]);

  useEffect(() => {
    if (!open || !lockBaseState || !pricingJob) return;
    let cancelled = false;
    setSlotsLoading(true);
    const debounceTimer = window.setTimeout(() => {
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
            if (attempt === 0) await sleep(400);
          }
          if (cancelled) return;
          if (!ok) {
            setRawSlots([]);
            setSlotHint("We couldn’t load times. Try another date or check your connection.");
            return;
          }
          setRawSlots(lastSlots);
        } catch {
          if (!cancelled) {
            setRawSlots([]);
            setSlotHint("Checking connection — try again or pick another date.");
          }
        } finally {
          if (!cancelled) setSlotsLoading(false);
        }
      })();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
      setSlotsLoading(false);
    };
  }, [open, lockBaseState, pricingJob, selectedDate, durationMinutesForApi]);

  const liveSlots: LiveSlot[] = useMemo(() => priceRawSlots(rawSlots), [priceRawSlots, rawSlots]);

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

  const handleSelectSlot = useCallback(
    async (time: string) => {
      if (!lockBaseState) return;
      const rawSlot = rawSlots.find((s) => s.time === time);
      if (!rawSlot?.available) return;
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
            onLocked?.();
          } catch {
            setSlotHint("We couldn’t save your slot. Allow site data for this site, then try again.");
          }
          return;
        }
        if (attempt < 3) await sleep(400 * (attempt + 1));
      }
      trackBookingFunnelEvent("datetime", "error", {
        message: lastErr,
        action: "lock_slot_checkout_modal",
        time,
        date: selectedDate,
      });
      if (lastErr === CONFIG_MISSING_BOOKING_LOCK_HMAC) {
        setSlotHint(
          "Booking confirmation is temporarily unavailable. Please try again in a few minutes, or contact us if this keeps happening.",
        );
        return;
      }
      setSlotHint("That time may have just been taken — pick another slot below.");
    },
    [lockBaseState, rawSlots, selectedDate, vipTier, onLocked],
  );

  function slotCardProps(time: string) {
    const slot = liveSlots.find((s) => s.time === time);
    const priceZar = slot && typeof slot.price === "number" && Number.isFinite(slot.price) ? slot.price : null;
    const row = slotPickRows.find((r) => r.time === time);
    const strategyBadge = row ? slotStrategyBadge(time, strategyRecommendedTime, strategyMinPrice, row) : null;
    return {
      time,
      priceZar,
      cleanersCount: row?.cleanersCount ?? 0,
      strategyBadge,
      selected: selectedTime === time,
    };
  }

  if (!lockBaseState) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="max-h-[min(90vh,720px)] overflow-y-auto p-6 pb-4">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-8 text-base sm:text-lg">{title}</DialogTitle>
            <DialogDescription className="text-left text-sm">{description}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{bookingCopy.when.dateHeading}</p>
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
                        "h-[68px] min-w-[60px] shrink-0 rounded-xl border px-1 text-xs",
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
            </div>

            {slotsLoading ? (
              <div className="space-y-2" role="status" aria-live="polite">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading available times…</p>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {slotHint ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/95 p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">
                <p>{slotHint}</p>
              </div>
            ) : null}

            {!slotsLoading && orderedDisplayTimes.length === 0 ? (
              isToday ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
                  <p>No slots left today.</p>
                  <button
                    type="button"
                    onClick={() => {
                      const tomorrow = tomorrowYmd(allDateValues);
                      if (tomorrow) setDateOverride(tomorrow);
                    }}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
                  >
                    Book for tomorrow
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-50">
                  <p>No slots on this day.</p>
                  <p className="mt-1 font-medium">{nextAvailableHint(allDateValues, selectedDate)}</p>
                </div>
              )
            ) : null}

            {!slotsLoading && orderedDisplayTimes.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tap a time to lock a new price</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
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
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => void handleSelectSlot(time)}
                        className={[
                          "min-w-0 w-full rounded-xl border p-2.5 text-left transition sm:p-3",
                          p.selected
                            ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-500 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-50"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium tabular-nums">{p.time}</div>
                          <div className="min-w-0 text-right">
                            {hasComparison ? (
                              <p className="text-[10px] tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                                R {anchorPrice.toLocaleString("en-ZA")}
                              </p>
                            ) : null}
                            <div className="text-sm font-semibold tabular-nums sm:text-base">
                              {p.priceZar != null ? `R ${p.priceZar.toLocaleString("en-ZA")}` : "—"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1 min-h-[1rem] text-[10px] font-medium">
                          {hasComparison && diff > 0 ? (
                            <span className="text-green-600 dark:text-green-400">
                              Save R {Math.abs(diff).toLocaleString("en-ZA")} ({Math.abs(percent)}%)
                            </span>
                          ) : hasComparison && diff < 0 ? (
                            <span className="text-orange-600 dark:text-orange-400">Peak (+{Math.abs(percent)}%)</span>
                          ) : (
                            <span className={badgeClass}>{badge ?? "—"}</span>
                          )}
                        </div>
                        {badgeHint ? (
                          <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">{badgeHint}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {orderedDisplayTimes.length > INITIAL_VISIBLE_SLOTS && !showAllTimes ? (
                  <button
                    type="button"
                    onClick={() => setShowAllTimes(true)}
                    className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:border-blue-400 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {bookingCopy.when.seeMoreTimes}
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              If you pick a different time, you may need to choose your cleaner again before paying.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
