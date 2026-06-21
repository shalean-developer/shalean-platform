export type PricingServiceRow = {
  id: string;
  slug: string;
  name: string;
  base_price: number;
  price_per_bedroom: number;
  price_per_bathroom: number;
  min_hours: number;
  max_hours: number;
  is_active: boolean;
  sort_order: number;
};

export type PricingExtraRow = {
  id: string;
  slug: string;
  name: string;
  price: number;
  service_type: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
};

export type RecurringDiscountRule = { type: "percent" | "fixed"; value: number };

export type CleanerPricingTier = {
  id: string;
  label: string;
  cleaner_count: number;
  /** Flat ZAR surcharge on top of reference base (0 for first cleaner). */
  surcharge_zar: number;
};

export type TeamPricingConfig = {
  team_member_count: number;
  label: string;
  notes: string;
};

export type EquipmentPricingConfigRow = {
  is_active: boolean;
  base_fee_zar: number;
  price_per_km_zar: number;
  max_auto_distance_km: number;
  base_address: string;
  base_latitude: number;
  base_longitude: number;
  manual_quote_message: string;
};

export type BookingPricingConfig = {
  recurring_discounts?: Record<string, RecurringDiscountRule>;
  extra_cleaner_fee_zar?: number;
  cleaner_pricing_tiers?: CleanerPricingTier[];
  team_pricing?: TeamPricingConfig;
  equipment_pricing?: EquipmentPricingConfigRow;
};

export function normalizeCatalogSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function newTierId(): string {
  return `tier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultCleanerTiers(extraCleanerFee: number): CleanerPricingTier[] {
  return [1, 2, 3].map((n) => ({
    id: `default-${n}`,
    label: `${n} cleaner${n > 1 ? "s" : ""}`,
    cleaner_count: n,
    surcharge_zar: Math.max(0, n - 1) * extraCleanerFee,
  }));
}

export function defaultTeamPricing(): TeamPricingConfig {
  return {
    team_member_count: 3,
    label: "Shalean team",
    notes: "Duration scales to roster size — base service price plus extras only.",
  };
}
