import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

const SERVICE_KEYS: readonly BookingServiceId[] = [
  "quick",
  "standard",
  "airbnb",
  "deep",
  "carpet",
  "move",
];

const TARIFF: ServiceTariff = {
  base: 300,
  bedroom: 50,
  bathroom: 40,
  extraRoom: 30,
  duration: { base: 2, bedroom: 0.25, bathroom: 0.2, extraRoom: 0.15 },
};

/** Deterministic catalog for Vitest — mirrors shape from Supabase-backed snapshots. */
export function vitestTestPricingRatesSnapshot(): PricingRatesSnapshot {
  const services = {} as Record<BookingServiceId, ServiceTariff>;
  for (const k of SERVICE_KEYS) services[k] = { ...TARIFF };
  return {
    codeVersion: PRICING_ENGINE_ALGORITHM_VERSION,
    services,
    extras: {
      "inside-oven": { price: 59, services: [...SERVICE_KEYS], name: "Inside oven" },
      "inside-fridge": { price: 59, services: [...SERVICE_KEYS], name: "Inside fridge" },
      "carpet-cleaning": { price: 400, services: ["deep", "move", "carpet"], name: "Carpet cleaning" },
      "mattress-cleaning": { price: 400, services: ["deep", "move", "carpet"], name: "Mattress cleaning" },
    },
    bundles: [
      {
        id: "deep_refresh_bundle",
        items: ["carpet-cleaning", "mattress-cleaning"],
        price: 599,
        services: ["deep"],
        label: "Deep refresh",
        blurb: "Bundle",
      },
    ],
  };
}
