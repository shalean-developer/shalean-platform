import type { BookingServiceId } from "@/components/booking/serviceCategories";

/**
 * Per-service ZAR lines + duration coefficients (hours) used by the checkout engine.
 * Rows are loaded from Supabase `pricing_services` and frozen into `pricing_versions`.
 */
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
};

export function getServiceBaseZarFromSnapshot(
  snapshot: { services: Record<BookingServiceId, ServiceTariff> },
  service: BookingServiceId | null,
): number {
  if (!service) return 0;
  return snapshot.services[service]?.base ?? 0;
}
