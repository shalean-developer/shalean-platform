import type { BookingServiceGroupKey, BookingServiceId, BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { inferServiceGroupFromServiceId, inferServiceTypeFromServiceId } from "@/components/booking/serviceCategories";
import { MAX_BOOKING_EXTRAS_ROWS } from "@/lib/booking/bookingExtrasLimits";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";

export function buildAdminPaystackLockedPayload(params: {
  serviceId: BookingServiceId;
  dateYmd: string;
  timeHm: string;
  location: string;
  finalPriceZar: number;
  /** Required — do not infer defaults (avoids wrong cleaner scope). */
  rooms: number;
  bathrooms: number;
  extras?: readonly string[];
}): Record<string, unknown> {
  const finalPrice = Math.max(1, Math.round(params.finalPriceZar));
  const svc = params.serviceId;
  const service_type = inferServiceTypeFromServiceId(svc);
  const service_group = inferServiceGroupFromServiceId(svc);
  const selectedCategory: BookingServiceGroupKey | null = service_group;
  if (!service_type || !selectedCategory) {
    throw new Error("Invalid service for admin checkout lock.");
  }

  if (!Number.isFinite(params.rooms) || !Number.isFinite(params.bathrooms)) {
    throw new Error("rooms and bathrooms must be finite numbers.");
  }
  const rooms = Math.min(20, Math.max(1, Math.round(params.rooms)));
  const bathrooms = Math.min(20, Math.max(1, Math.round(params.bathrooms)));

  const extras: string[] = [];
  if (Array.isArray(params.extras)) {
    const seen = new Set<string>();
    for (const x of params.extras) {
      if (typeof x !== "string") continue;
      const s = x.trim();
      if (!s || !BOOKING_EXTRA_ID_SET.has(s) || seen.has(s)) continue;
      seen.add(s);
      extras.push(s);
      if (extras.length >= MAX_BOOKING_EXTRAS_ROWS) break;
    }
  }

  return {
    locked: true,
    lockedAt: new Date().toISOString(),
    date: params.dateYmd,
    time: params.timeHm,
    finalPrice,
    finalHours: 3,
    surge: 1,
    rooms,
    bathrooms,
    extraRooms: 0,
    extras,
    location: params.location.trim().slice(0, 500),
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    service_group: selectedCategory,
    service_type,
    selectedCategory,
    service: svc,
  };
}
