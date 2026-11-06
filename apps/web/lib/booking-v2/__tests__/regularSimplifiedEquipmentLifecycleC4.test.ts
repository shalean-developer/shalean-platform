import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { regularEquipmentQuoteReady } from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const section = source("src/features/booking-v2/components/EquipmentSection.tsx");
const wrapper = source("src/features/booking-v2/steps/RegularSimplifiedDetailsReview.tsx");
const context = source("src/features/booking-v2/BookingV2Context.tsx");

describe("FCO-01 C4 equipment quote and navigation regression", () => {
  it("invalidates the prior fee as soon as address-dependent inputs change", () => {
    expect(section).toContain('const clearQuote = () => setValue("equipmentQuote", null');
    expect(section).toContain("clearQuote();\n    setFetchError(null);\n    setLoading(true)");
    for (const field of ["address,", "suburb,", "city,", "postalCode,", "equipmentRequired,"]) {
      expect(section).toContain(field);
    }
  });

  it("aborts active requests when scope changes and discards late results", () => {
    expect(section).toContain("const controller = new AbortController()");
    expect(section).toContain("let active = true");
    expect(section).toContain("if (!active || controller.signal.aborted) return");
    expect(section).toContain("window.clearTimeout(timer)");
    expect(section).toContain("controller.abort()");
  });

  it("has one owner for quote invalidation, not a second wrapper effect", () => {
    expect(wrapper).toContain("<EquipmentSection />");
    expect(wrapper).not.toContain('setValue("equipmentQuote", null');
  });

  it("redirects deep-linked or restored incomplete journeys to the proper earlier step", () => {
    expect(context).toContain("if (!simplifiedRegularJourney || currentStep <= 1) return");
    expect(context).toContain("if (!regularHomeAnswersComplete(values))");
    expect(context).toContain("!buildStep2Schema(scheduling).safeParse(values).success");
    expect(context).toContain("!step1Schema.safeParse(values).success || !regularEquipmentQuoteReady(values)");
    expect(context).toContain("void goToStep(3)");
  });

  it("does not accept missing or manual equipment quotes for automatic payment", () => {
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: null })).toBe(false);
    const q = {
      distance_km: 4, base_fee: 450, price_per_km: 25, distance_charge: 100,
      logistics_fee: 550, base_location: "Cape Town",
      manual_quote_required: false, manual_quote_message: "",
    };
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: q })).toBe(true);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: { ...q, manual_quote_required: true } })).toBe(false);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: { ...q, geocode_error: true } })).toBe(false);
  });
});
