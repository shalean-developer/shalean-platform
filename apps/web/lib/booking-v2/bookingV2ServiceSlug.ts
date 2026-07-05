import { canonicalizeBookingServiceSlug } from "@/lib/booking/canonicalizeBookingServiceSlug";
import { isValidServiceSlug, SERVICE_CONFIG, type ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingRow } from "@/lib/dashboard/types";

/** Maps booking-v2 path slug → canonical `bookings.service_slug` / eligibility id. */
export const BOOKING_V2_TO_CANONICAL_SERVICE: Record<ServiceSlug, string> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "office",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

const CANONICAL_TO_BOOKING_V2: Record<string, ServiceSlug> = Object.fromEntries(
  Object.entries(BOOKING_V2_TO_CANONICAL_SERVICE).map(([v2, canonical]) => [canonical, v2 as ServiceSlug]),
) as Record<string, ServiceSlug>;

export function bookingServiceSlugFromBookingRow(
  row: Pick<BookingRow, "service" | "service_slug">,
): ServiceSlug {
  const raw = row.service_slug?.trim() || row.service?.trim() || "";
  if (raw && isValidServiceSlug(raw)) return raw as ServiceSlug;
  const canonical = canonicalizeBookingServiceSlug(raw);
  if (CANONICAL_TO_BOOKING_V2[canonical]) return CANONICAL_TO_BOOKING_V2[canonical];
  if (raw && isValidServiceSlug(raw.replace(/_/g, "-"))) {
    return raw.replace(/_/g, "-") as ServiceSlug;
  }
  return "regular-cleaning";
}

export function canonicalServiceSlugFromBookingV2(serviceSlug: string): string {
  const mapped = BOOKING_V2_TO_CANONICAL_SERVICE[serviceSlug as ServiceSlug];
  if (mapped) return mapped;
  return canonicalizeBookingServiceSlug(serviceSlug);
}

export function deriveDurationMinutesFromBookingV2(
  serviceSlug: string,
  durationFromPricing?: number | null,
): number {
  if (typeof durationFromPricing === "number" && Number.isFinite(durationFromPricing) && durationFromPricing > 0) {
    return Math.max(30, Math.round(durationFromPricing));
  }
  const staticConfig = SERVICE_CONFIG[serviceSlug as ServiceSlug];
  if (staticConfig) return Math.max(30, Math.round(staticConfig.estimatedDurationHours * 60));
  return 180;
}

export function parseServiceDetailInt(
  details: Record<string, string | number | boolean> | undefined,
  key: string,
  fallback: number,
): number {
  const raw = details?.[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : fallback;
}
