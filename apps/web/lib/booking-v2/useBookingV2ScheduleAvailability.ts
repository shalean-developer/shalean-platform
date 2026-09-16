"use client";

import { useEffect, useMemo, useState } from "react";
import { checkoutScheduleSlotsAllUnavailable } from "@/lib/booking/useCheckoutScheduleAvailability";
import { canonicalServiceSlugFromBookingV2 } from "@/lib/booking-v2/bookingV2ServiceSlug";
import { bedroomsBathroomsFromV2ServiceDetails } from "@/lib/booking-v2/bookingV2SlotEligibility";
import {
  buildCustomerBookingTimeSlots,
  filterCustomerOnlineBookingTimeSlots,
} from "@/lib/booking-v2/customerBookingTimeSlots";
import type { BookingV2SchedulingConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import type { BookingFulfillmentMode } from "@/lib/booking/bookingFulfillmentMode";
import {
  bookingV2ScheduleAvailabilityCacheKey,
  normalizedBookingDurationMinutes,
} from "@/lib/booking-v2/bookingV2ScheduleVerification";

type SlotRow = {
  time: string;
  available: boolean;
  availableInstant?: boolean;
  fulfillmentMode?: BookingFulfillmentMode;
};

type VerifiedSlotSnapshot = {
  key: string;
  slots: SlotRow[];
  verifiedAt: number;
};

const SLOT_AVAILABILITY_CACHE_MS = 20_000;
const slotAvailabilityCache = new Map<string, VerifiedSlotSnapshot>();

function buildV2AvailabilityMap(
  slots: SlotRow[],
  dateYmd: string,
  scheduling?: Partial<BookingV2SchedulingConfig>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of buildCustomerBookingTimeSlots(scheduling)) {
    out[t] = false;
  }
  const allowedTimes = new Set(filterCustomerOnlineBookingTimeSlots(dateYmd, { scheduling }));
  for (const row of slots) {
    const hm = row.time?.trim().slice(0, 5);
    if (hm && /^\d{2}:\d{2}$/.test(hm) && allowedTimes.has(hm)) {
      out[hm] = Boolean(row.available);
    }
  }
  return out;
}

function buildFulfillmentMap(
  slots: SlotRow[],
  dateYmd: string,
  scheduling?: Partial<BookingV2SchedulingConfig>,
): Record<string, BookingFulfillmentMode> {
  const out: Record<string, BookingFulfillmentMode> = {};
  const allowedTimes = new Set(filterCustomerOnlineBookingTimeSlots(dateYmd, { scheduling }));
  for (const row of slots) {
    const hm = row.time?.trim().slice(0, 5);
    if (hm && /^\d{2}:\d{2}$/.test(hm) && allowedTimes.has(hm) && row.available) {
      out[hm] = row.fulfillmentMode ?? (row.availableInstant === false ? "ops_assignment" : "instant");
    }
  }
  return out;
}

function scheduleAvailabilityUrl(args: {
  dateYmd: string;
  locationId: string;
  serviceSlug: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  durationMinutes: number;
}): string {
  const params = new URLSearchParams();
  params.set("date", args.dateYmd);
  params.set("serviceType", canonicalServiceSlugFromBookingV2(args.serviceSlug));
  params.set("bedrooms", String(args.bedrooms));
  params.set("bathrooms", String(args.bathrooms));
  params.set("duration", String(args.durationMinutes));
  if (args.extraRooms > 0) params.set("extraRooms", String(args.extraRooms));
  if (args.extras.length > 0) params.set("extras", args.extras.join(","));
  params.set("locationId", args.locationId);
  return `/api/booking/time-slots?${params.toString()}`;
}

export function useBookingV2ScheduleAvailability(args: {
  dateYmd: string | null;
  locationId: string | null;
  serviceSlug: string;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: string[];
  durationMinutes: number;
  scheduling?: Partial<BookingV2SchedulingConfig>;
}): {
  availability: Record<string, boolean> | undefined;
  fulfillmentBySlot: Record<string, BookingFulfillmentMode> | undefined;
  dayFulfillmentMode: BookingFulfillmentMode | null;
  loading: boolean;
  fetchError: boolean;
  slotsVerified: boolean;
} {
  const [snapshot, setSnapshot] = useState<VerifiedSlotSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const { bedrooms, bathrooms, extraRooms } = useMemo(
    () => bedroomsBathroomsFromV2ServiceDetails(args.serviceDetails),
    [args.serviceDetails],
  );

  const normalizedDurationMinutes = normalizedBookingDurationMinutes(args.durationMinutes);
  const normalizedExtrasSignature = [...new Set(
    args.selectedExtras.map((extra) => extra.trim()).filter(Boolean),
  )]
    .sort()
    .join("\u001f");
  const normalizedExtras = useMemo(
    () => (normalizedExtrasSignature ? normalizedExtrasSignature.split("\u001f") : []),
    [normalizedExtrasSignature],
  );
  const requestKey = bookingV2ScheduleAvailabilityCacheKey({
    dateYmd: args.dateYmd,
    locationId: args.locationId,
    serviceSlug: args.serviceSlug,
    bedrooms,
    bathrooms,
    extraRooms,
    extras: normalizedExtras,
    durationMinutes: normalizedDurationMinutes,
  });
  const canFetch = requestKey != null;

  useEffect(() => {
    if (!canFetch || !requestKey || !args.dateYmd || !args.locationId) {
      return;
    }

    const ac = new AbortController();
    const cached = slotAvailabilityCache.get(requestKey);
    queueMicrotask(() => {
      if (ac.signal.aborted) return;
      if (cached && Date.now() - cached.verifiedAt <= SLOT_AVAILABILITY_CACHE_MS) {
        setSnapshot(cached);
      } else {
        setSnapshot((current) => (current?.key === requestKey ? current : null));
      }
      setLoading(true);
      setFetchError(false);
    });

    const url = scheduleAvailabilityUrl({
      dateYmd: args.dateYmd,
      locationId: args.locationId,
      serviceSlug: args.serviceSlug,
      bedrooms,
      bathrooms,
      extraRooms,
      extras: normalizedExtras,
      durationMinutes: normalizedDurationMinutes,
    });

    void (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        const json = (await res.json()) as { slots?: SlotRow[] };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setFetchError(true);
          return;
        }
        const verifiedSnapshot = {
          key: requestKey,
          slots: json.slots ?? [],
          verifiedAt: Date.now(),
        } satisfies VerifiedSlotSnapshot;
        slotAvailabilityCache.set(requestKey, verifiedSnapshot);
        setSnapshot(verifiedSnapshot);
        setFetchError(false);
      } catch {
        if (ac.signal.aborted) return;
        setFetchError(true);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [
    canFetch,
    requestKey,
    args.dateYmd,
    args.locationId,
    args.serviceSlug,
    bedrooms,
    bathrooms,
    extraRooms,
    normalizedExtras,
    normalizedDurationMinutes,
  ]);

  const slots = snapshot?.key === requestKey ? snapshot.slots : null;
  const slotsVerified = Boolean(requestKey && snapshot?.key === requestKey);

  const availability = useMemo(() => {
    if (!args.dateYmd) return undefined;
    if (!args.locationId) return checkoutScheduleSlotsAllUnavailable();
    // Keep prior map while refreshing so Step 2 does not clear the selected time mid-fetch.
    if (!slotsVerified && slots === null) return undefined;
    if (slots === null) return checkoutScheduleSlotsAllUnavailable();
    return buildV2AvailabilityMap(slots, args.dateYmd, args.scheduling);
  }, [args.dateYmd, args.locationId, args.scheduling, slots, slotsVerified]);

  const fulfillmentBySlot = useMemo(() => {
    if (!args.dateYmd || !args.locationId || !slotsVerified || slots === null) return undefined;
    return buildFulfillmentMap(slots, args.dateYmd, args.scheduling);
  }, [args.dateYmd, args.locationId, args.scheduling, slots, slotsVerified]);

  const dayFulfillmentMode = useMemo((): BookingFulfillmentMode | null => {
    if (!fulfillmentBySlot) return null;
    const modes = Object.values(fulfillmentBySlot);
    if (modes.length === 0) return null;
    if (modes.every((m) => m === "area_review")) return "area_review";
    if (modes.every((m) => m === "ops_assignment" || m === "area_review")) return "ops_assignment";
    if (modes.some((m) => m === "instant")) return "instant";
    return modes[0] ?? null;
  }, [fulfillmentBySlot]);

  return {
    availability,
    fulfillmentBySlot,
    dayFulfillmentMode,
    loading: canFetch && loading,
    fetchError: canFetch && fetchError,
    slotsVerified,
  };
}
