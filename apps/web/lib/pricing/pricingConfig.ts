import type { BookingServiceId } from "@/components/booking/serviceCategories";

/**
 * Single source of truth for job ZAR (base + per-room lines) and billable hours shape.
 * Bump `version` when any rate or duration coefficient changes (locks → `REQUOTE_REQUIRED`).
 * Slot multipliers, VIP, charm, and demand math stay in `pricingEngine.ts`.
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

export const PRICING_CONFIG = {
  version: 5 as const,

  services: {
    /** Light / small visit — aligned with standard duration curve, lower line rates. */
    quick: {
      base: 150,
      bedroom: 35,
      bathroom: 45,
      extraRoom: 25,
      duration: { base: 3.5, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.3 },
    },
    standard: {
      base: 340,
      bedroom: 45,
      bathroom: 60,
      extraRoom: 35,
      duration: { base: 3.5, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.3 },
    },
    airbnb: {
      base: 380,
      bedroom: 55,
      bathroom: 70,
      extraRoom: 40,
      duration: { base: 3.5, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.3 },
    },
    deep: {
      base: 950,
      bedroom: 160,
      bathroom: 180,
      extraRoom: 120,
      duration: { base: 4, bedroom: 0.75, bathroom: 0.75, extraRoom: 0.5 },
    },
    carpet: {
      base: 280,
      bedroom: 95,
      bathroom: 105,
      extraRoom: 70,
      duration: { base: 4, bedroom: 0.65, bathroom: 0.65, extraRoom: 0.45 },
    },
    move: {
      base: 850,
      bedroom: 130,
      bathroom: 150,
      extraRoom: 100,
      duration: { base: 4, bedroom: 0.75, bathroom: 0.75, extraRoom: 0.5 },
    },
  } satisfies Record<BookingServiceId, ServiceTariff>,
} as const;

export type PricingConfigVersion = typeof PRICING_CONFIG.version;

/** When `service` is unknown, room lines use the standard row (historical engine behaviour). */
export function tariffForPricingService(service: BookingServiceId | null): ServiceTariff {
  if (service && service in PRICING_CONFIG.services) {
    return PRICING_CONFIG.services[service];
  }
  return PRICING_CONFIG.services.standard;
}

export function getServiceBaseZar(service: BookingServiceId | null): number {
  if (!service) return 0;
  return PRICING_CONFIG.services[service]?.base ?? 0;
}
