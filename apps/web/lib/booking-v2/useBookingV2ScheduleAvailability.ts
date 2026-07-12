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

type SlotRow = {
  time: string;
  available: boolean;
  availableInstant?: boolean;
  fulfillmentMode?: BookingFulfillmentMode;
};

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
} {
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const { bedrooms, bathrooms, extraRooms } = useMemo(
    () => bedroomsBathroomsFromV2ServiceDetails(args.serviceDetails),
    [args.serviceDetails],
  );

  const canFetch = Boolean(args.dateYmd && args.locationId && args.serviceSlug);

  useEffect(() => {
    if (!canFetch || !args.dateYmd || !args.locationId) {
      setSlots(null);
      setLoading(false);
      setFetchError(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setFetchError(false);
    setSlots(null);

    const url = scheduleAvailabilityUrl({
      dateYmd: args.dateYmd,
      locationId: args.locationId,
      serviceSlug: args.serviceSlug,
      bedrooms,
      bathrooms,
      extraRooms,
      extras: args.selectedExtras,
      durationMinutes: args.durationMinutes,
    });

    void (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        const json = (await res.json()) as { slots?: SlotRow[] };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setSlots([]);
          setFetchError(true);
          return;
        }
        setSlots(json.slots ?? []);
        setFetchError(false);
      } catch {
        if (ac.signal.aborted) return;
        setSlots([]);
        setFetchError(true);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [
    canFetch,
    args.dateYmd,
    args.locationId,
    args.serviceSlug,
    bedrooms,
    bathrooms,
    extraRooms,
    args.selectedExtras.join(","),
    args.durationMinutes,
  ]);

  const availability = useMemo(() => {
    if (!args.dateYmd) return undefined;
    if (!args.locationId) return checkoutScheduleSlotsAllUnavailable();
    // Keep prior map while refreshing so Step 2 does not clear the selected time mid-fetch.
    if (loading && slots === null) return undefined;
    if (slots === null) return checkoutScheduleSlotsAllUnavailable();
    return buildV2AvailabilityMap(slots, args.dateYmd, args.scheduling);
  }, [args.dateYmd, args.locationId, args.scheduling, loading, slots]);

  const fulfillmentBySlot = useMemo(() => {
    if (!args.dateYmd || !args.locationId || loading || slots === null) return undefined;
    return buildFulfillmentMap(slots, args.dateYmd, args.scheduling);
  }, [args.dateYmd, args.locationId, args.scheduling, loading, slots]);

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
    fetchError,
  };
}
