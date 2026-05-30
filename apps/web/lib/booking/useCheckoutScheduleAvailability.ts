"use client";

import { useEffect, useMemo, useState } from "react";
import { generateBookingTimeSlots } from "@/lib/booking/bookingTimeSlots";

export type CheckoutScheduleAvailabilitySlot = {
  time: string;
  available: boolean;
};

type FetchArgs = {
  dateYmd: string;
  locationId: string | null;
  serviceType: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

function buildAvailabilityMap(slots: CheckoutScheduleAvailabilitySlot[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of generateBookingTimeSlots()) {
    out[t] = false;
  }
  for (const row of slots) {
    const hm = row.time?.trim().slice(0, 5);
    if (hm && /^\d{2}:\d{2}$/.test(hm)) {
      out[hm] = Boolean(row.available);
    }
  }
  return out;
}

/** All static slots marked unavailable (no area / loading / error). */
export function checkoutScheduleSlotsAllUnavailable(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of generateBookingTimeSlots()) {
    out[t] = false;
  }
  return out;
}

function scheduleAvailabilityUrl(args: FetchArgs): string {
  const params = new URLSearchParams();
  params.set("date", args.dateYmd);
  params.set("serviceType", args.serviceType);
  params.set("bedrooms", String(Math.max(1, args.bedrooms)));
  params.set("bathrooms", String(Math.max(1, args.bathrooms)));
  if (args.extraRooms > 0) params.set("extraRooms", String(args.extraRooms));
  if (args.extras.length > 0) params.set("extras", args.extras.join(","));
  if (args.locationId) params.set("locationId", args.locationId);
  return `/api/booking/time-slots?${params.toString()}`;
}

export function useCheckoutScheduleAvailability(args: {
  dateYmd: string | null;
  /** Resolved `locations.id` (structured pick, API slug match, or resolve-location). */
  locationId: string | null;
  serviceType: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
}): {
  availability: Record<string, boolean> | undefined;
  loading: boolean;
  fetchError: boolean;
} {
  const [slots, setSlots] = useState<CheckoutScheduleAvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const canFetch = Boolean(args.dateYmd && args.locationId);

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

    const url = scheduleAvailabilityUrl({
      dateYmd: args.dateYmd,
      locationId: args.locationId,
      serviceType: args.serviceType,
      bedrooms: args.bedrooms,
      bathrooms: args.bathrooms,
      extraRooms: args.extraRooms,
      extras: args.extras,
    });

    void (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        const json = (await res.json()) as { slots?: CheckoutScheduleAvailabilitySlot[] };
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
    args.serviceType,
    args.bedrooms,
    args.bathrooms,
    args.extraRooms,
    args.extras.join(","),
  ]);

  const availability = useMemo(() => {
    if (!args.dateYmd) return undefined;
    if (!args.locationId) return checkoutScheduleSlotsAllUnavailable();
    if (loading || slots === null) return checkoutScheduleSlotsAllUnavailable();
    return buildAvailabilityMap(slots);
  }, [args.dateYmd, args.locationId, loading, slots]);

  return {
    availability,
    loading: canFetch && loading,
    fetchError,
  };
}
