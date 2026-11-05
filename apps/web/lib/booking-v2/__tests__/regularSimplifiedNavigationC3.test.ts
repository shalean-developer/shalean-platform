import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  regularHomeAnswersComplete,
  regularEquipmentQuoteReady,
  regularSimplifiedPreviewEnabled,
} from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("FCO-01-C3 guarded Regular Cleaning journey", () => {
  const context = read("src/features/booking-v2/BookingV2Context.tsx");
  const shell = read("src/features/booking-v2/BookingV2Shell.tsx");
  const details = read("src/features/booking-v2/steps/RegularSimplifiedDetailsReview.tsx");

  it("shares a production-blocked flag between the form and rendering", () => {
    expect(typeof regularSimplifiedPreviewEnabled).toBe("function");
    expect(context).toContain("regularSimplifiedPreviewEnabled(serviceSlug)");
    expect(shell).toContain("regularSimplifiedPreviewEnabled(serviceSlug)");
    expect(context).toContain('if (simplifiedRegularJourney) defaults.equipmentRequired = ""');
    expect(context).toContain('data.equipmentRequired === "" ? "" as const');
  });

  it("runs Home readiness before step 2 and defers the existing full schema to step 3", () => {
    expect(context).toContain("if (simplifiedRegularJourney) {\n          if (!regularHomeAnswersComplete(values))");
    expect(context).toContain("const fullDetails = step1Schema.safeParse(values)");
    expect(context).toContain('if (simplifiedRegularJourney && !form.getValues("pendingBookingId")?.trim())');
    expect(context).toContain("currentStep === 4 && !values.pendingBookingId?.trim()");
    expect(context).toContain("regularEquipmentQuoteReady(values)");
    expect(context).toContain("if (firstInvalidStage && !simplifiedRegularJourney)");
    expect(context).toContain("await canGoNext(currentStep)");
    expect(context).toContain("if (!simplifiedRegularJourney || currentStep <= 1) return;");
    expect(context).toContain("void goToStep(3)");
  });

  it("preserves slot verification and payment protections", () => {
    expect(context).toContain("verifySelectedBookingV2Slot");
    expect(context).toContain("verifySelectedBookingV2Cleaners");
    expect(context).toContain("canEnterBookingPayment");
    expect(context).toContain("abandonPendingPaymentBeforeEdit");
    expect(shell).toContain("authoritativeQuoteAllowsPaymentEntry");
  });

  it("collects full address and equipment fee before payment", () => {
    expect(details).toContain("<PropertyAddressSection />");
    expect(details).toContain("<EquipmentSection />");
    expect(details).toContain("EquipmentSection owns address-scoped quote invalidation");
    const equipment = read("src/features/booking-v2/components/EquipmentSection.tsx");
    expect(equipment).toContain('setValue("equipmentQuote", null');
    expect(equipment).toContain("controller.abort()");
    expect(equipment).toContain("!active || controller.signal.aborted");
    expect(details).toContain("equipmentReady");
    expect(shell).toContain("<RegularSimplifiedDetailsReview />");
  });

  it("disallows unanswered scope and unresolved logistics", () => {
    const values = {
      serviceDetails: { propertyType: "house", bedrooms: "2", bathrooms: "1", extraRooms: "0", hasPets: "no" },
      equipmentRequired: "" as const,
      suburb: "Claremont",
      serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
    };
    expect(regularHomeAnswersComplete(values)).toBe(false);
    expect(regularHomeAnswersComplete({ ...values, equipmentRequired: "no" })).toBe(true);
    expect(regularEquipmentQuoteReady({ equipmentRequired: "yes", equipmentQuote: null })).toBe(false);
  });
});
