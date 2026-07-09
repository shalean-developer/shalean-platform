import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import {
  resolveCanonicalDurationWorkload,
  type DurationWorkloadResult,
} from "@/lib/pricing/cleaningDurationWorkload";
import {
  normalizePricingJobInput,
  resolveServiceForPricing,
  type PricingJobInput,
} from "@/lib/pricing/pricingEngine";

const V2_TO_CANONICAL: Record<ServiceSlug, BookingServiceId> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "standard",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

/** One-decimal hours aligned with legacy lock display (`finalHours`). */
export function durationHoursFromMinutes(minutes: number): number {
  const m = Math.max(0, Math.round(minutes));
  return Math.round((m / 60) * 10) / 10;
}

export function resolveLegacyJobDurationWorkload(
  job: PricingJobInput,
  teamMemberCount = 1,
): DurationWorkloadResult {
  const j = normalizePricingJobInput(job);
  return resolveCanonicalDurationWorkload({
    service: resolveServiceForPricing(j),
    rooms: j.rooms,
    bathrooms: j.bathrooms,
    extraRooms: j.extraRooms,
    extras: j.extras,
    teamMemberCount,
  });
}

function parseServiceDetailCount(
  details: Record<string, string | number | boolean>,
  key: string,
): number {
  const raw = details[key];
  if (raw === "" || raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveBookingV2DurationWorkload(input: {
  serviceSlug: ServiceSlug;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: readonly string[];
  cleanerMode: "team" | "individual_cleaners";
  cleanerCount: number;
}): DurationWorkloadResult {
  const canonical = V2_TO_CANONICAL[input.serviceSlug];
  let rooms = parseServiceDetailCount(input.serviceDetails, "bedrooms");
  let bathrooms = parseServiceDetailCount(input.serviceDetails, "bathrooms");
  let extraRooms = parseServiceDetailCount(input.serviceDetails, "extraRooms");

  if (input.serviceSlug === "carpet-cleaning") {
    rooms = parseServiceDetailCount(input.serviceDetails, "carpetRooms");
    bathrooms = 0;
    extraRooms = 0;
  } else if (input.serviceSlug === "office-cleaning") {
    rooms = 0;
    extraRooms = 0;
  }

  return resolveCanonicalDurationWorkload({
    service: canonical,
    rooms,
    bathrooms,
    extraRooms,
    extras: input.selectedExtras,
    teamMemberCount: input.cleanerMode === "team" ? 3 : input.cleanerCount,
  });
}

/** Legacy checkout quote hours — canonical workload is runtime truth (Phase 1). */
export function estimateUnifiedJobDurationHours(job: PricingJobInput, teamMemberCount = 1): number {
  return durationHoursFromMinutes(resolveLegacyJobDurationWorkload(job, teamMemberCount).duration_minutes);
}
