import type { BookingServiceId } from "@/components/booking/serviceCategories";

/**
 * Per-service ZAR lines + duration coefficients (hours) used by the checkout engine.
 * Rows are loaded from Supabase `pricing_services` and frozen into `pricing_versions`.
 */
export type ServiceDurationLimits = {
  minHours: number;
  maxHours: number;
};

/** Product default when admin rows omit limits (Phase 3). */
export const DEFAULT_SERVICE_DURATION_LIMITS: ServiceDurationLimits = {
  minHours: 3.5,
  maxHours: 8,
};

export type ServiceTariff = {
  base: number;
  bedroom: number;
  bathroom: number;
  extraRoom: number;
  duration: {
    base: number;
    bedroom: number;
    bathroom: number;
    extraRoom: number;
  };
  /** Admin-configured clamp bounds from `pricing_services.min_hours` / `max_hours`. */
  durationLimits?: ServiceDurationLimits;
};

export function serviceDurationMinuteLimits(
  limits?: ServiceDurationLimits | null,
): { minMinutes: number; maxMinutes: number } {
  const minHours = limits?.minHours ?? DEFAULT_SERVICE_DURATION_LIMITS.minHours;
  const maxHours = Math.max(minHours, limits?.maxHours ?? DEFAULT_SERVICE_DURATION_LIMITS.maxHours);
  return {
    minMinutes: Math.round(minHours * 60),
    maxMinutes: Math.round(maxHours * 60),
  };
}

export function getServiceBaseZarFromSnapshot(
  snapshot: { services: Record<BookingServiceId, ServiceTariff> },
  service: BookingServiceId | null,
): number {
  if (!service) return 0;
  return snapshot.services[service]?.base ?? 0;
}
