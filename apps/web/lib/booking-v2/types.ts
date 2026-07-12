import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";
import type { DurationWorkloadResult } from "@/lib/pricing/cleaningDurationWorkload";

export type { EquipmentQuoteResult };

export type PricingLineItem = {
  label: string;
  amountZar: number;
};

export type SelectedExtraLine = {
  extra_id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
};

/** Full customer pricing breakdown persisted on bookings.pricing_summary (v2). */
export type CustomerPricingBreakdown = {
  base_service_price: number;
  property_factors_total: number;
  bedrooms_price: number;
  bathrooms_price: number;
  extra_rooms_price: number;
  property_size_price: number;
  selected_extras: SelectedExtraLine[];
  selected_extras_total: number;
  supplies_equipment_fee: number;
  /** Distance-based equipment delivery + collection fee (replaces flat supplies_equipment_fee). */
  equipment_logistics_fee: number;
  equipment_distance_km: number;
  equipment_base_fee: number;
  equipment_distance_charge: number;
  manual_quote_required: boolean;
  extra_cleaner_cost: number;
  /** Cleaning subtotal before equipment and service fee. */
  cleaning_service_subtotal: number;
  /** VIP loyalty discount applied to cleaning subtotal (Phase 2). */
  vip_discount_zar?: number;
  vip_tier?: string;
  subtotal_before_service_fee: number;
  service_fee: number;
  recurring_discount: number;
  estimated_total: number;
  estimated_duration_minutes: number;
  /** Unified quote engine — one-decimal hours (matches legacy `finalHours`). */
  duration_hours?: number;
  team_scaled_duration_minutes?: number;
  cleaner_workload?: number;
  /** HMAC binding price + duration + inputs ({@link BOOKING_QUOTE_ENGINE_VERSION}). */
  quote_signature?: string;
  calculation_version?: number;
  lineItems: PricingLineItem[];
  /** Legacy flat fields for backward compatibility */
  basePrice: number;
  extrasTotal: number;
  cleanerSurcharge: number;
  total: number;
};

/** Legacy v2 shape before structured breakdown */
export type LegacyPricingSummary = {
  basePrice?: number;
  extrasTotal?: number;
  cleanerSurcharge?: number;
  total?: number;
  lineItems?: PricingLineItem[];
};

export type RecurringDiscountRule = {
  type: "percent" | "fixed";
  value: number;
};

export type BookingV2FeesConfig = {
  suppliesEquipmentFeeZar: number;
  extraCleanerFeeZar: number;
  serviceFeeRule: "flat" | "percent" | "percent_floor" | "optimized" | "none";
  serviceFeeFlatCents: number;
  serviceFeePercent: number;
  recurringDiscounts: Record<string, RecurringDiscountRule>;
  propertyFactorRates: PropertyFactorRatesConfig;
  /** Admin-only internal cost for supplies (not charged separately from customer fee) */
  suppliesEquipmentCostZar: number;
};

export type PropertyFactorRatesConfig = {
  propertyType?: Record<string, number>;
  officeSize?: Record<string, number>;
  lastCleaned?: Record<string, number>;
  furnished?: Record<string, number>;
  carpetType?: Record<string, number>;
  stains?: Record<string, number>;
  carpetRooms_per_room_zar?: number;
};

export type CustomerTotalInput = {
  serviceSlug: ServiceSlug;
  serviceLabel: string;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: string[];
  cleanerMode: "team" | "individual_cleaners";
  cleanerCount: number;
  bookingType: "once_off" | "recurring";
  recurringFrequency: string;
  catalog: {
    basePrice: number;
    pricePerBedroom: number;
    pricePerBathroom: number;
    pricePerExtraRoom: number;
    pricePerExtraCleaner: number;
    estimatedDurationHours: number;
    minDurationHours: number;
    maxDurationHours: number;
    extras: Array<{ id: string; label: string; priceZar: number }>;
    allowsExtraCleaner?: boolean;
    showEquipmentQuestion?: boolean;
    /** @deprecated use showEquipmentQuestion */
    showCleaningProductsQuestion?: boolean;
  };
  feesConfig: BookingV2FeesConfig;
  equipmentRequired?: boolean;
  equipmentQuote?: EquipmentQuoteResult | null;
  /** When set, duration comes from the unified quote engine (must match price inputs). */
  precomputedDurationWorkload?: DurationWorkloadResult;
  /** Loyalty tier from user_profiles.tier — applied server-side on confirm. */
  vipTier?: string | null;
};

export function isStructuredPricingBreakdown(
  v: unknown,
): v is CustomerPricingBreakdown {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.estimated_total === "number" && typeof o.base_service_price === "number";
}

export function normalizePricingSummary(raw: unknown): CustomerPricingBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  if (isStructuredPricingBreakdown(raw)) return raw;
  const legacy = raw as LegacyPricingSummary;
  if (typeof legacy.total !== "number") return null;
  const base = legacy.basePrice ?? 0;
  const extras = legacy.extrasTotal ?? 0;
  const cleaner = legacy.cleanerSurcharge ?? 0;
  return {
    base_service_price: base,
    property_factors_total: Math.max(0, legacy.total - base - extras - cleaner),
    bedrooms_price: 0,
    bathrooms_price: 0,
    extra_rooms_price: 0,
    property_size_price: 0,
    selected_extras: [],
    selected_extras_total: extras,
    supplies_equipment_fee: 0,
    equipment_logistics_fee: 0,
    equipment_distance_km: 0,
    equipment_base_fee: 0,
    equipment_distance_charge: 0,
    manual_quote_required: false,
    cleaning_service_subtotal: legacy.total,
    vip_discount_zar: 0,
    extra_cleaner_cost: cleaner,
    subtotal_before_service_fee: legacy.total,
    service_fee: 0,
    recurring_discount: 0,
    estimated_total: legacy.total,
    estimated_duration_minutes: 0,
    lineItems: legacy.lineItems ?? [],
    basePrice: base,
    extrasTotal: extras,
    cleanerSurcharge: cleaner,
    total: legacy.total,
  };
}
