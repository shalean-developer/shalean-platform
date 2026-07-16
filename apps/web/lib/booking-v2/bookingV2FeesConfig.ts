import type { BookingV2FeesConfig, PropertyFactorRatesConfig, RecurringDiscountRule } from "@/lib/booking-v2/types";
import {
  DEFAULT_BOOKING_SERVICE_FEE_CENTS,
  resolveBookingServiceFeeRule,
} from "@/lib/booking/serviceFee";

const DEFAULT_RECURRING: Record<string, RecurringDiscountRule> = {
  weekly: { type: "percent", value: 10 },
  fortnightly: { type: "percent", value: 5 },
  monthly: { type: "percent", value: 0 },
  custom: { type: "percent", value: 0 },
};

const DEFAULT_PROPERTY_FACTORS: PropertyFactorRatesConfig = {
  propertyType: { house: 0, apartment: 0, townhouse: 0 },
  officeSize: { small: 0, medium: 50, large: 120, enterprise: 250 },
  lastCleaned: { never: 100, "6_months_plus": 80, "3_6_months": 40, "1_3_months": 0 },
  furnished: { yes: 50, no: 0 },
  carpetType: { standard: 0, thick_pile: 50, berber: 30, persian_rug: 80 },
  stains: { yes: 80, no: 0 },
  /** Fallback to catalog.pricePerBedroom when 0; staging seed sets a positive rate. */
  carpetRooms_per_room_zar: 0,
  rugs_per_unit_zar: 180,
  sofa_per_unit_zar: 250,
};

function parseDiscountRule(raw: unknown): RecurringDiscountRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type === "fixed" ? "fixed" : o.type === "percent" ? "percent" : null;
  const value = Number(o.value);
  if (!type || !Number.isFinite(value) || value < 0) return null;
  return { type, value };
}

function mergePropertyFactors(raw: unknown): PropertyFactorRatesConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROPERTY_FACTORS };
  const src = raw as Record<string, unknown>;
  const out: PropertyFactorRatesConfig = { ...DEFAULT_PROPERTY_FACTORS };
  for (const key of Object.keys(DEFAULT_PROPERTY_FACTORS) as (keyof PropertyFactorRatesConfig)[]) {
    if (
      key === "carpetRooms_per_room_zar" ||
      key === "rugs_per_unit_zar" ||
      key === "sofa_per_unit_zar"
    ) {
      const n = Number(src[key]);
      if (Number.isFinite(n) && n >= 0) out[key] = Math.round(n);
      continue;
    }
    const table = src[key];
    if (table && typeof table === "object") {
      const merged: Record<string, number> = { ...(out[key] as Record<string, number>) };
      for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) merged[k] = Math.round(n);
      }
      out[key] = merged;
    }
  }
  return out;
}

export function defaultBookingV2FeesConfig(
  extrasPrices?: { extraCleanerZar?: number },
): BookingV2FeesConfig {
  const envRule = resolveBookingServiceFeeRule();
  let serviceFeeRule: BookingV2FeesConfig["serviceFeeRule"] = "flat";
  if (envRule === "percent_floor") serviceFeeRule = "percent_floor";
  else if (envRule === "optimized") serviceFeeRule = "optimized";

  return {
    /** Customer supplies surcharge — 0 means included in the service quote (see booking copy). */
    suppliesEquipmentFeeZar: 0,
    extraCleanerFeeZar: extrasPrices?.extraCleanerZar ?? 299,
    serviceFeeRule,
    serviceFeeFlatCents: DEFAULT_BOOKING_SERVICE_FEE_CENTS,
    serviceFeePercent: 5,
    recurringDiscounts: { ...DEFAULT_RECURRING },
    propertyFactorRates: { ...DEFAULT_PROPERTY_FACTORS },
    suppliesEquipmentCostZar: 150,
  };
}

/** Parse pricing_booking_config JSONB row merged with pricing_extras slugs. */
export function parseBookingV2FeesConfig(
  configJson: unknown,
  extrasPrices?: { extraCleanerZar?: number },
): BookingV2FeesConfig {
  const base = defaultBookingV2FeesConfig(extrasPrices);
  if (!configJson || typeof configJson !== "object") return base;

  const c = configJson as Record<string, unknown>;

  const suppliesFee = Number(c.supplies_equipment_fee_zar);
  if (Number.isFinite(suppliesFee) && suppliesFee >= 0) {
    base.suppliesEquipmentFeeZar = Math.round(suppliesFee);
  }

  if (extrasPrices?.extraCleanerZar != null) {
    base.extraCleanerFeeZar = extrasPrices.extraCleanerZar;
  } else {
    const n = Number(c.extra_cleaner_fee_zar);
    if (Number.isFinite(n) && n >= 0) base.extraCleanerFeeZar = Math.round(n);
  }

  const ruleRaw = String(c.service_fee_rule ?? "").trim().toLowerCase();
  if (
    ruleRaw === "flat" ||
    ruleRaw === "percent" ||
    ruleRaw === "percent_floor" ||
    ruleRaw === "optimized" ||
    ruleRaw === "none"
  ) {
    base.serviceFeeRule = ruleRaw;
  }

  const flatCents = Number(c.service_fee_flat_cents);
  if (Number.isFinite(flatCents) && flatCents >= 0) {
    base.serviceFeeFlatCents = Math.round(flatCents);
  }

  const pct = Number(c.service_fee_percent);
  if (Number.isFinite(pct) && pct >= 0) base.serviceFeePercent = pct;

  const discountsRaw = c.recurring_discounts;
  if (discountsRaw && typeof discountsRaw === "object") {
    for (const [freq, rule] of Object.entries(discountsRaw as Record<string, unknown>)) {
      const parsed = parseDiscountRule(rule);
      if (parsed) base.recurringDiscounts[freq] = parsed;
    }
  }

  base.propertyFactorRates = mergePropertyFactors(c.property_factor_rates);

  const cost = Number(c.supplies_equipment_cost_zar);
  if (Number.isFinite(cost) && cost >= 0) base.suppliesEquipmentCostZar = Math.round(cost);

  return base;
}
