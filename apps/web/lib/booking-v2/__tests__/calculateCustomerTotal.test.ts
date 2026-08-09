import { describe, expect, it } from "vitest";
import { calculateCustomerTotal, computeServiceFeeZar, applyRecurringDiscountZar } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { CustomerTotalInput } from "@/lib/booking-v2/types";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";

function baseInput(overrides: Partial<CustomerTotalInput> = {}): CustomerTotalInput {
  const feesConfig = defaultBookingV2FeesConfig({ extraCleanerZar: 299 });
  feesConfig.serviceFeeRule = "flat";
  feesConfig.serviceFeeFlatCents = 3000;
  return {
    serviceSlug: "regular-cleaning",
    serviceLabel: "Regular Cleaning",
    serviceDetails: {
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      propertyType: "house",
    },
    selectedExtras: [],
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    bookingType: "once_off",
    recurringFrequency: "",
    catalog: {
      basePrice: 399,
      pricePerBedroom: 45,
      pricePerBathroom: 55,
      pricePerExtraRoom: 30,
      pricePerExtraCleaner: 299,
      estimatedDurationHours: 3,
      minDurationHours: 3.5,
      maxDurationHours: 8,
      extras: [{ id: "inside_oven", label: "Inside Oven", priceZar: 200 }],
    },
    feesConfig,
    ...overrides,
  };
}

describe("calculateCustomerTotal", () => {
  it("computes base + room factors for regular cleaning", () => {
    const r = calculateCustomerTotal(baseInput());
    expect(r.base_service_price).toBe(399);
    expect(r.bedrooms_price).toBe(90);
    expect(r.bathrooms_price).toBe(55);
    expect(r.property_factors_total).toBe(145);
    expect(r.supplies_equipment_fee).toBe(0);
    expect(r.extra_cleaner_cost).toBe(0);
    expect(r.subtotal_before_service_fee).toBe(544);
    expect(r.service_fee).toBe(30);
    expect(r.estimated_total).toBe(574);
  });

  it("does not charge equipment fee when not requested", () => {
    const r = calculateCustomerTotal(baseInput());
    expect(r.equipment_logistics_fee).toBe(0);
    expect(r.lineItems.some((l) => /equipment/i.test(l.label))).toBe(false);
  });

  it("adds distance-based equipment logistics fee when required", () => {
    const quote: EquipmentQuoteResult = {
      distance_km: 10,
      base_fee: 450,
      price_per_km: 25,
      distance_charge: 250,
      logistics_fee: 700,
      base_location: "Base",
      manual_quote_required: false,
      manual_quote_message: "Manual quote required.",
    };
    const r = calculateCustomerTotal(
      baseInput({
        catalog: {
          ...baseInput().catalog,
          showEquipmentQuestion: true,
        },
        equipmentRequired: true,
        equipmentQuote: quote,
      }),
    );
    expect(r.equipment_logistics_fee).toBe(700);
    expect(r.subtotal_before_service_fee).toBe(544 + 700);
    expect(r.lineItems.some((l) => l.label === "Equipment logistics fee")).toBe(true);
  });

  it("does not add equipment fee when manual quote required", () => {
    const quote: EquipmentQuoteResult = {
      distance_km: 25,
      base_fee: 450,
      price_per_km: 25,
      distance_charge: 0,
      logistics_fee: 0,
      base_location: "Base",
      manual_quote_required: true,
      manual_quote_message: "Manual quote required.",
    };
    const r = calculateCustomerTotal(
      baseInput({
        catalog: { ...baseInput().catalog, showEquipmentQuestion: true },
        equipmentRequired: true,
        equipmentQuote: quote,
      }),
    );
    expect(r.equipment_logistics_fee).toBe(0);
    expect(r.manual_quote_required).toBe(true);
  });

  it("charges extra cleaner cost for 2 cleaners on regular cleaning", () => {
    const r = calculateCustomerTotal(baseInput({ cleanerCount: 2 }));
    expect(r.extra_cleaner_cost).toBe(299);
  });

  it("charges two extra cleaner fees for 3 cleaners", () => {
    const r = calculateCustomerTotal(baseInput({ cleanerCount: 3 }));
    expect(r.extra_cleaner_cost).toBe(598);
  });

  it("does not charge extra cleaner for deep cleaning team mode", () => {
    const r = calculateCustomerTotal(
      baseInput({
        serviceSlug: "deep-cleaning",
        serviceLabel: "Deep Cleaning",
        cleanerMode: "team",
        cleanerCount: 3,
        serviceDetails: {
          bedrooms: "3",
          bathrooms: "2",
          extraRooms: "0",
          propertyType: "house",
          lastCleaned: "never",
        },
        catalog: {
          basePrice: 899,
          pricePerBedroom: 65,
          pricePerBathroom: 75,
          pricePerExtraRoom: 40,
          pricePerExtraCleaner: 0,
          estimatedDurationHours: 6,
          minDurationHours: 3.5,
          maxDurationHours: 8,
          extras: [],
        },
      }),
    );
    expect(r.extra_cleaner_cost).toBe(0);
    expect(r.property_size_price).toBeGreaterThan(0);
  });

  it("includes selected extras", () => {
    const r = calculateCustomerTotal(baseInput({ selectedExtras: ["inside_oven"] }));
    expect(r.selected_extras_total).toBe(200);
    expect(r.selected_extras[0]?.name).toBe("Inside Oven");
  });

  it("drops unknown and non-positive extras instead of creating R0 line items", () => {
    const r = calculateCustomerTotal(
      baseInput({
        selectedExtras: ["unknown-extra", "free-extra", "inside_oven"],
        catalog: {
          ...baseInput().catalog,
          extras: [
            ...baseInput().catalog.extras,
            { id: "free-extra", label: "Misconfigured extra", priceZar: 0 },
          ],
        },
      }),
    );

    expect(r.selected_extras).toEqual([
      expect.objectContaining({ extra_id: "inside_oven", price: 200, total: 200 }),
    ]);
    expect(r.selected_extras_total).toBe(200);
  });

  it("applies weekly recurring discount after service fee", () => {
    const r = calculateCustomerTotal(
      baseInput({
        bookingType: "recurring",
        recurringFrequency: "weekly",
      }),
    );
    const beforeDiscount = r.subtotal_before_service_fee + r.service_fee;
    expect(r.recurring_discount).toBe(Math.round(beforeDiscount * 0.1));
    expect(r.estimated_total).toBe(beforeDiscount - r.recurring_discount);
  });

  it("never returns negative estimated_total", () => {
    const feesConfig = defaultBookingV2FeesConfig();
    feesConfig.recurringDiscounts.weekly = { type: "fixed", value: 99999 };
    const r = calculateCustomerTotal(
      baseInput({
        bookingType: "recurring",
        recurringFrequency: "weekly",
        feesConfig,
      }),
    );
    expect(r.estimated_total).toBe(0);
  });

  it("computes office size factor", () => {
    const r = calculateCustomerTotal(
      baseInput({
        serviceSlug: "office-cleaning",
        serviceLabel: "Office Cleaning",
        serviceDetails: {
          officeSize: "large",
          bathrooms: "2",
        },
        catalog: {
          basePrice: 450,
          pricePerBedroom: 0,
          pricePerBathroom: 50,
          pricePerExtraRoom: 0,
          pricePerExtraCleaner: 220,
          estimatedDurationHours: 3,
          minDurationHours: 3.5,
          maxDurationHours: 8,
          extras: [],
        },
      }),
    );
    expect(r.property_size_price).toBeGreaterThanOrEqual(120);
  });
});

describe("computeServiceFeeZar", () => {
  it("returns 0 when disabled", () => {
    const cfg = defaultBookingV2FeesConfig();
    cfg.serviceFeeRule = "none";
    expect(computeServiceFeeZar(500, cfg)).toBe(0);
  });

  it("applies percent rule", () => {
    const cfg = defaultBookingV2FeesConfig();
    cfg.serviceFeeRule = "percent";
    cfg.serviceFeePercent = 10;
    expect(computeServiceFeeZar(500, cfg)).toBe(50);
  });
});

describe("applyRecurringDiscountZar", () => {
  it("returns 0 for once-off", () => {
    const cfg = defaultBookingV2FeesConfig();
    expect(applyRecurringDiscountZar(1000, "once_off", "weekly", cfg)).toBe(0);
  });
});
