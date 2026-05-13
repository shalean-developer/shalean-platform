import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import { normalizePricingJobInput, resolveServiceForPricing } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

const MIN_LEGACY_QUOTE_HOURS = 2;
const MIN_LEGACY_DURATION_MINUTES = 30;
const FALLBACK_LEGACY_DURATION_MINUTES = 120;

function tariffFromSnapshot(snapshot: PricingRatesSnapshot, service: BookingServiceId | null): ServiceTariff {
  if (service && snapshot.services[service]) return snapshot.services[service];
  return snapshot.services.standard;
}

export function legacyHoursToDurationMinutes(
  hours: number | null | undefined,
  fallbackMinutes = FALLBACK_LEGACY_DURATION_MINUTES,
): number {
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return Math.max(MIN_LEGACY_DURATION_MINUTES, Math.round(hours * 60));
  }
  return fallbackMinutes;
}

export function selectLegacyJobDurationHours(snapshot: PricingRatesSnapshot, job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const cfg = tariffFromSnapshot(snapshot, resolveServiceForPricing(j));
  const d = cfg.duration;
  const raw = d.base + j.rooms * d.bedroom + j.bathrooms * d.bathroom + j.extraRooms * d.extraRoom;
  return Math.max(MIN_LEGACY_QUOTE_HOURS, Math.round(raw * 10) / 10);
}

export function selectLegacyJobDurationMinutes(snapshot: PricingRatesSnapshot, job: PricingJobInput): number {
  return legacyHoursToDurationMinutes(selectLegacyJobDurationHours(snapshot, job));
}

export function selectLegacyLockedBookingDurationMinutes(locked: LockedBooking | null): number {
  if (!locked) return FALLBACK_LEGACY_DURATION_MINUTES;
  return legacyHoursToDurationMinutes(locked.duration ?? locked.finalHours);
}
