import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { checkoutDurationMinutesFromLocked } from "@/lib/booking/lockedBookingDurationMinutes";
import { parsePricingServiceParams, resolveServiceForPricing } from "@/lib/pricing/pricingEngine";

/**
 * Normalized slot inputs shared by lock validation, `/api/booking/cleaners`, and checkout pool checks.
 * `locationExpandedIds === null` means no location scoping (broadcast pool — same as {@link getAvailableCleaners}).
 */
export type SlotEligibilityCore = {
  date: string;
  startTime: string;
  durationMinutes: number;
  locationId: string;
  locationExpandedIds: string[] | null;
  bookingServiceSlug: BookingServiceId | null;
};

const DUMMY_JOB_FOR_SERVICE_RESOLUTION = {
  rooms: 1,
  bathrooms: 1,
  extraRooms: 0,
  extras: [] as string[],
} as const;

/**
 * Matches `/api/booking/cleaners` service normalization (pricing service id / type keys → catalog id).
 */
export function resolveBookingServiceSlugForSlotEligibility(raw: string | null | undefined): BookingServiceId | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const { service, serviceType } = parsePricingServiceParams(s);
  return resolveServiceForPricing({
    ...DUMMY_JOB_FOR_SERVICE_RESOLUTION,
    service,
    serviceType: serviceType ?? undefined,
  });
}

/** Same catalog service resolution used when the client already stores a booking service id string. */
export function resolveBookingServiceSlugFromStoredService(stored: string | null | undefined): BookingServiceId | null {
  const sid = parseBookingServiceId(stored);
  if (sid) return sid;
  return resolveBookingServiceSlugForSlotEligibility(stored);
}

export function slotEligibilityCoreFromLockBody(
  body: Record<string, unknown>,
  opts: { timeHm: string; durationHours: number; catalogServiceId?: string | null },
): SlotEligibilityCore | null {
  const loc = String(body.locationId ?? body.location_id ?? "").trim();
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!loc || !/^[0-9a-f-]{36}$/i.test(loc)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const durationMinutes = Math.max(30, Math.round(opts.durationHours * 60));
  const hm = opts.timeHm.trim().slice(0, 5);
  return {
    date,
    startTime: hm,
    durationMinutes,
    locationId: loc,
    locationExpandedIds: [loc],
    bookingServiceSlug: resolveBookingServiceSlugFromStoredService(opts.catalogServiceId),
  };
}

export function slotEligibilityCoreFromBookingCleanersUrl(url: URL): SlotEligibilityCore | null {
  const selectedDate = url.searchParams.get("date") ?? "";
  const selectedTime = url.searchParams.get("time") ?? "";
  if (!selectedDate || !selectedTime) return null;

  const locationRaw = url.searchParams.get("locationId")?.trim() ?? url.searchParams.get("location_id")?.trim() ?? "";
  const hasUuid = /^[0-9a-f-]{36}$/i.test(locationRaw);

  const durationRaw = Number(url.searchParams.get("duration"));
  const durationMinutes =
    Number.isFinite(durationRaw) && durationRaw >= 30 ? Math.round(durationRaw) : 120;

  const serviceRaw = (url.searchParams.get("serviceType") ?? url.searchParams.get("service") ?? "").trim();

  return {
    date: selectedDate,
    startTime: selectedTime.trim().slice(0, 5),
    durationMinutes,
    locationId: hasUuid ? locationRaw : "",
    locationExpandedIds: hasUuid ? [locationRaw] : null,
    bookingServiceSlug: resolveBookingServiceSlugFromStoredService(serviceRaw),
  };
}

export function slotEligibilityCoreFromLockedBooking(locked: LockedBooking): SlotEligibilityCore | null {
  const date = locked.date?.trim() ?? "";
  const time = locked.time?.trim() ?? "";
  const loc = locked.serviceAreaLocationId?.trim() ?? "";
  if (!date || !time || !loc) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(loc)) return null;

  const durationMinutes = checkoutDurationMinutesFromLocked(locked);

  return {
    date,
    startTime: time.slice(0, 5),
    durationMinutes,
    locationId: loc,
    locationExpandedIds: [loc],
    bookingServiceSlug: resolveBookingServiceSlugFromStoredService(locked.service),
  };
}

function expandedIdsEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  return a.every((id, i) => id.toLowerCase() === (b[i] ?? "").toLowerCase());
}

export function slotEligibilityCoresEqual(a: SlotEligibilityCore | null, b: SlotEligibilityCore | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.date === b.date &&
    a.startTime === b.startTime &&
    a.durationMinutes === b.durationMinutes &&
    a.locationId.toLowerCase() === b.locationId.toLowerCase() &&
    expandedIdsEqual(a.locationExpandedIds, b.locationExpandedIds) &&
    a.bookingServiceSlug === b.bookingServiceSlug
  );
}
