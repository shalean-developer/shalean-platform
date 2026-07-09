import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import type {
  BookingV2FeesConfig,
  CustomerPricingBreakdown,
  CustomerTotalInput,
  PricingLineItem,
  RecurringDiscountRule,
} from "@/lib/booking-v2/types";
import {
  computePropertyFactors,
  EXTRA_CLEANER_SERVICE_SLUGS,
} from "@/lib/booking-v2/propertyFactorPricing";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";
import { resolveBookingV2DurationWorkload } from "@/lib/booking/quote/resolveBookingDurationWorkload";

export function computeServiceFeeZar(
  subtotalBeforeServiceFee: number,
  feesConfig: BookingV2FeesConfig,
): number {
  const rule = feesConfig.serviceFeeRule;
  if (rule === "none") return 0;

  const subtotalCents = Math.max(0, Math.round(subtotalBeforeServiceFee * 100));

  if (rule === "percent") {
    return Math.round((subtotalCents * feesConfig.serviceFeePercent) / 100) / 100;
  }
  if (rule === "percent_floor") {
    return Math.max(20, Math.round((subtotalCents * feesConfig.serviceFeePercent) / 100) / 100);
  }
  if (rule === "optimized") {
    const cents = Math.max(2000, Math.min(5000, Math.round(subtotalCents * 0.05)));
    return cents / 100;
  }
  return feesConfig.serviceFeeFlatCents / 100;
}

export function applyRecurringDiscountZar(
  amountBeforeDiscount: number,
  bookingType: "once_off" | "recurring",
  recurringFrequency: string,
  feesConfig: BookingV2FeesConfig,
): number {
  if (bookingType !== "recurring" || !recurringFrequency) return 0;
  const rule: RecurringDiscountRule | undefined =
    feesConfig.recurringDiscounts[recurringFrequency];
  if (!rule || rule.value <= 0) return 0;

  if (rule.type === "fixed") {
    return Math.min(Math.round(rule.value), Math.round(amountBeforeDiscount));
  }
  return Math.round((amountBeforeDiscount * rule.value) / 100);
}

function computeSelectedExtras(
  selectedExtras: string[],
  catalogExtras: Array<{ id: string; label: string; priceZar: number }>,
) {
  const lines = selectedExtras.map((extraId) => {
    const extra = catalogExtras.find((e) => e.id === extraId);
    const price = extra?.priceZar ?? 0;
    return {
      extra_id: extraId,
      name: extra?.label ?? extraId,
      price,
      quantity: 1,
      total: price,
    };
  });
  const selected_extras_total = lines.reduce((sum, l) => sum + l.total, 0);
  return { selected_extras: lines, selected_extras_total };
}

function computeExtraCleanerCost(
  allowsExtraCleaner: boolean,
  cleanerMode: "team" | "individual_cleaners",
  cleanerCount: number,
  feesConfig: BookingV2FeesConfig,
  catalogFallback: number,
): number {
  if (cleanerMode === "team") return 0;
  if (!allowsExtraCleaner) return 0;
  const fee = feesConfig.extraCleanerFeeZar || catalogFallback || 0;
  const extraCleaners = Math.max(0, Math.min(3, cleanerCount) - 1);
  return extraCleaners * fee;
}

function resolveDurationWorkloadForInput(input: CustomerTotalInput) {
  if (input.precomputedDurationWorkload) return input.precomputedDurationWorkload;
  return resolveBookingV2DurationWorkload({
    serviceSlug: input.serviceSlug,
    serviceDetails: input.serviceDetails,
    selectedExtras: input.selectedExtras,
    cleanerMode: input.cleanerMode,
    cleanerCount: input.cleanerCount,
    durationLimits: {
      minHours: input.catalog.minDurationHours,
      maxHours: input.catalog.maxDurationHours,
    },
  });
}

export function calculateCustomerTotal(input: CustomerTotalInput): CustomerPricingBreakdown {
  const {
    serviceSlug,
    serviceLabel,
    serviceDetails,
    selectedExtras,
    cleanerMode,
    cleanerCount,
    bookingType,
    recurringFrequency,
    catalog,
    feesConfig,
  } = input;

  const base_service_price = Math.round(catalog.basePrice);

  const factors = computePropertyFactors(serviceSlug, serviceDetails, catalog, feesConfig);

  const { selected_extras, selected_extras_total } = computeSelectedExtras(
    selectedExtras,
    catalog.extras,
  );

  const showEquipmentQuestion =
    catalog.showEquipmentQuestion ?? catalog.showCleaningProductsQuestion ?? false;

  const equipment_logistics_fee =
    showEquipmentQuestion && input.equipmentRequired && input.equipmentQuote
      ? input.equipmentQuote.manual_quote_required
        ? 0
        : input.equipmentQuote.logistics_fee
      : 0;

  const equipment_distance_km = input.equipmentQuote?.distance_km ?? 0;
  const equipment_base_fee = input.equipmentQuote?.base_fee ?? 0;
  const equipment_distance_charge = input.equipmentQuote?.distance_charge ?? 0;
  const manual_quote_required = Boolean(
    showEquipmentQuestion && input.equipmentRequired && input.equipmentQuote?.manual_quote_required,
  );

  /** @deprecated always 0 — use equipment_logistics_fee */
  const supplies_equipment_fee = 0;

  const extra_cleaner_cost = computeExtraCleanerCost(
    catalog.allowsExtraCleaner ?? EXTRA_CLEANER_SERVICE_SLUGS.has(serviceSlug),
    cleanerMode,
    cleanerCount,
    feesConfig,
    catalog.pricePerExtraCleaner,
  );

  const cleaning_service_subtotal =
    base_service_price +
    factors.property_factors_total +
    selected_extras_total +
    extra_cleaner_cost;

  const subtotal_before_service_fee =
    cleaning_service_subtotal + equipment_logistics_fee;

  const service_fee = computeServiceFeeZar(subtotal_before_service_fee, feesConfig);

  const beforeDiscount = subtotal_before_service_fee + service_fee;
  const recurring_discount = applyRecurringDiscountZar(
    beforeDiscount,
    bookingType,
    recurringFrequency,
    feesConfig,
  );

  const estimated_total = Math.max(
    0,
    Math.round(beforeDiscount - recurring_discount),
  );

  const duration_workload = resolveDurationWorkloadForInput(input);
  const estimated_duration_minutes = duration_workload.duration_minutes;

  const lineItems = buildCustomerPriceLineItems(
    {
      serviceLabel,
      serviceSlug,
      base_service_price,
      factorLines: factors.factorLines,
      selected_extras,
      cleaning_service_subtotal,
      equipmentQuote: input.equipmentQuote ?? null,
      equipmentRequired: Boolean(input.equipmentRequired),
      showEquipmentQuestion,
      equipment_logistics_fee,
      extra_cleaner_cost,
      cleanerCount,
      service_fee,
      recurring_discount,
      bookingType,
      recurringFrequency,
      serviceDetails,
    },
    feesConfig,
  );

  return {
    base_service_price,
    property_factors_total: factors.property_factors_total,
    bedrooms_price: factors.bedrooms_price,
    bathrooms_price: factors.bathrooms_price,
    extra_rooms_price: factors.extra_rooms_price,
    property_size_price: factors.property_size_price,
    selected_extras,
    selected_extras_total,
    supplies_equipment_fee,
    equipment_logistics_fee,
    equipment_distance_km,
    equipment_base_fee,
    equipment_distance_charge,
    manual_quote_required,
    cleaning_service_subtotal,
    extra_cleaner_cost,
    subtotal_before_service_fee,
    service_fee,
    recurring_discount,
    estimated_total,
    estimated_duration_minutes,
    lineItems,
    basePrice: base_service_price,
    extrasTotal: selected_extras_total,
    cleanerSurcharge: extra_cleaner_cost,
    total: estimated_total,
  };
}

type LineItemBuildInput = {
  serviceLabel: string;
  serviceSlug: ServiceSlug;
  base_service_price: number;
  factorLines: Array<{ label: string; amountZar: number }>;
  selected_extras: CustomerPricingBreakdown["selected_extras"];
  cleaning_service_subtotal: number;
  equipmentQuote: EquipmentQuoteResult | null;
  equipmentRequired: boolean;
  showEquipmentQuestion: boolean;
  equipment_logistics_fee: number;
  extra_cleaner_cost: number;
  cleanerCount: number;
  service_fee: number;
  recurring_discount: number;
  bookingType: "once_off" | "recurring";
  recurringFrequency: string;
  serviceDetails: Record<string, string | number | boolean>;
};

export function buildCustomerPriceLineItems(
  input: LineItemBuildInput,
  _feesConfig?: BookingV2FeesConfig,
): PricingLineItem[] {
  const lines: PricingLineItem[] = [];
  const showEquipmentBreakdown =
    input.showEquipmentQuestion && input.equipmentRequired && input.equipmentQuote;

  if (showEquipmentBreakdown) {
    lines.push({
      label: "Cleaning service total",
      amountZar: input.cleaning_service_subtotal,
    });
  } else {
    lines.push({ label: `${input.serviceLabel} (base)`, amountZar: input.base_service_price });

    for (const factor of input.factorLines) {
      if (factor.amountZar > 0) {
        lines.push({ label: factor.label, amountZar: factor.amountZar });
      }
    }

    for (const extra of input.selected_extras) {
      lines.push({ label: extra.name, amountZar: extra.total });
    }

    if (input.extra_cleaner_cost > 0) {
      const n = Math.max(0, input.cleanerCount - 1);
      lines.push({
        label: `${n} extra cleaner${n > 1 ? "s" : ""}`,
        amountZar: input.extra_cleaner_cost,
      });
    }
  }

  if (showEquipmentBreakdown && input.equipmentQuote) {
    if (!input.equipmentQuote.manual_quote_required && input.equipment_logistics_fee > 0) {
      lines.push({
        label: `Equipment distance: ${input.equipmentQuote.distance_km} km`,
        amountZar: 0,
      });
      lines.push({
        label: `Equipment base fee: R${input.equipmentQuote.base_fee}`,
        amountZar: input.equipmentQuote.base_fee,
      });
      lines.push({
        label: `Distance charge: R${input.equipmentQuote.distance_charge}`,
        amountZar: input.equipmentQuote.distance_charge,
      });
      lines.push({
        label: "Equipment logistics fee",
        amountZar: input.equipment_logistics_fee,
      });
    }
  }

  if (input.service_fee > 0) {
    lines.push({ label: "Service fee", amountZar: input.service_fee });
  }

  if (input.recurring_discount > 0) {
    const freqLabel =
      input.recurringFrequency === "fortnightly"
        ? "Fortnightly"
        : input.recurringFrequency.charAt(0).toUpperCase() +
          input.recurringFrequency.slice(1);
    lines.push({
      label: `Recurring discount (${freqLabel})`,
      amountZar: -input.recurring_discount,
    });
  }

  return lines;
}

export function buildAdminPricingLines(
  breakdown: CustomerPricingBreakdown,
  adminExtras?: { suppliesEquipmentCostZar?: number; companyRevenueCents?: number | null; cleanerEarningsCents?: number | null },
): PricingLineItem[] {
  const lines = [...breakdown.lineItems];
  if (adminExtras?.suppliesEquipmentCostZar != null && adminExtras.suppliesEquipmentCostZar > 0) {
    lines.push({
      label: "Supplies cost (internal)",
      amountZar: adminExtras.suppliesEquipmentCostZar,
    });
  }
  if (adminExtras?.cleanerEarningsCents != null) {
    lines.push({
      label: "Cleaner earnings",
      amountZar: Math.round(adminExtras.cleanerEarningsCents) / 100,
    });
  }
  if (adminExtras?.companyRevenueCents != null) {
    lines.push({
      label: "Company revenue",
      amountZar: Math.round(adminExtras.companyRevenueCents) / 100,
    });
  }
  lines.push({ label: "Customer total", amountZar: breakdown.estimated_total });
  return lines;
}
