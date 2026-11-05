import { describe, expect, it } from "vitest";
import {
  isRegularSimplifiedJourneyEnabled,
  REGULAR_SIMPLIFIED_STAGE_CONTRACT,
  REGULAR_HOME_REQUIRED_FIELDS,
  REGULAR_DEFERRED_DETAILS_FIELDS,
  regularHomeAnswersComplete,
  regularEquipmentQuoteReady,
} from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

const home = {
  serviceDetails: {
    propertyType: "house",
    bedrooms: "2",
    bathrooms: "1",
    extraRooms: "0",
    hasPets: "no",
  },
  equipmentRequired: "no" as const,
  suburb: "Claremont",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("FCO-01-C1 Regular Cleaning opt-in contract", () => {
  it("fails closed by default and cannot be activated in production", () => {
    expect(isRegularSimplifiedJourneyEnabled({
      serviceSlug: "regular-cleaning", environment: "production", enabled: true,
    })).toBe(false);
    expect(isRegularSimplifiedJourneyEnabled({
      serviceSlug: "regular-cleaning", environment: "staging", enabled: false,
    })).toBe(false);
    expect(isRegularSimplifiedJourneyEnabled({
      serviceSlug: "regular-cleaning", environment: "staging", enabled: true,
    })).toBe(true);
    expect(isRegularSimplifiedJourneyEnabled({
      serviceSlug: "deep-cleaning", environment: "staging", enabled: true,
    })).toBe(false);
  });

  it("keeps the canonical four engine steps and existing query tokens", () => {
    expect(REGULAR_SIMPLIFIED_STAGE_CONTRACT.map((stage) => stage.step)).toEqual([1, 2, 3, 4]);
    expect(REGULAR_SIMPLIFIED_STAGE_CONTRACT.map((stage) => stage.query))
      .toEqual(["details", "schedule", "review", "payment"]);
  });

  it("requires explicit equipment choice and distinguishes zero from unanswered rooms", () => {
    expect(regularHomeAnswersComplete(home)).toBe(true);
    expect(regularHomeAnswersComplete({ ...home, equipmentRequired: "" })).toBe(false);
    expect(regularHomeAnswersComplete({
      ...home, serviceDetails: { ...home.serviceDetails, extraRooms: "" },
    })).toBe(false);
    expect(regularHomeAnswersComplete({
      ...home, serviceDetails: { ...home.serviceDetails, extraRooms: 0 },
    })).toBe(true);
    expect(regularHomeAnswersComplete({ ...home, serviceAreaLocationId: "" })).toBe(false);
  });

  it("defers personal details, not supported suburb and equipment choice", () => {
    expect(REGULAR_HOME_REQUIRED_FIELDS).toContain("serviceAreaLocationId");
    expect(REGULAR_HOME_REQUIRED_FIELDS).toContain("equipmentRequired");
    expect(REGULAR_DEFERRED_DETAILS_FIELDS).toContain("address");
    expect(REGULAR_DEFERRED_DETAILS_FIELDS).toContain("contactPhone");
  });

  it("blocks unresolved Shalean equipment pricing and allows customer-provided equipment", () => {
    expect(regularEquipmentQuoteReady({ equipmentRequired: "no", equipmentQuote: null })).toBe(true);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "", equipmentQuote: null })).toBe(false);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: null })).toBe(false);
    const quote = {
      distance_km: 5, base_fee: 450, price_per_km: 25,
      distance_charge: 125, logistics_fee: 575,
      base_location: "Cape Town", manual_quote_required: false, manual_quote_message: "",
    };
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: quote })).toBe(true);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes",
      equipmentQuote: { ...quote, manual_quote_required: true } })).toBe(false);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes",
      equipmentQuote: { ...quote, geocode_error: true } })).toBe(false);
  });
});
