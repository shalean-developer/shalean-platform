import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_PRICING_CONTRACTS } from "@/lib/booking-v2/servicePricingContract";

const pricingHook = readFileSync(
  join(process.cwd(), "src/features/booking-v2/hooks/useBookingV2Pricing.ts"),
  "utf8",
);
const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);

const sixServices = [
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "office-cleaning",
  "carpet-cleaning",
  "airbnb-cleaning",
] as const;

describe("UAT-QUOTE-STALE-01", () => {
  it("invalidates the signed lock and replaces the displayed quote from the current serialized scope", () => {
    expect(pricingHook).toContain('setValue("quoteLock", null');
    expect(pricingHook).toContain("const currentServiceDetails = JSON.parse(serviceDetailsSnapshot)");
    expect(pricingHook).toContain("const currentSelectedExtras = JSON.parse(selectedExtrasSnapshot)");
    expect(pricingHook).toContain("const breakdown = buildCustomerPricingFromForm({");
    expect(pricingHook).toContain('setValue("pricingSummary", breakdown');
    expect(pricingHook.indexOf("const breakdown = buildCustomerPricingFromForm({"))
      .toBeLessThan(pricingHook.indexOf('setValue("pricingSummary", breakdown'));
  });

  it("subscribes to nested service details and selected extras for every service", () => {
    expect(pricingHook).toContain('useWatch({ control, name: "serviceDetails" })');
    expect(pricingHook).toContain('useWatch({ control, name: "selectedExtras" })');
    expect(pricingHook).toContain("serviceDetailsSnapshot");
    expect(pricingHook).toContain("selectedExtrasSnapshot");
    for (const service of sixServices) {
      expect(SERVICE_PRICING_CONTRACTS[service]).toBeDefined();
    }
  });

  it("keeps schedule/cleaner invalidation for all six services", () => {
    expect(contextSource).toContain("const prevCoreServiceScopeRef");
    expect(contextSource).toContain("const prevOfficeScopeRef");
    expect(contextSource).toContain("const prevCarpetScopeRef");
    expect(contextSource).toContain("const prevAirbnbScopeRef");
    expect(contextSource).toContain('form.setValue("time", ""');
    expect(contextSource).toContain('form.setValue("selectedCleanerIds", []');
  });

  it("keeps slower server responses from overwriting the latest scope", () => {
    expect(pricingHook).toContain("const revision = ++quoteRevision.current");
    expect(pricingHook).toContain("revision === quoteRevision.current");
  });
});

describe("BOOKING-PAY-01 — edit after Paystack cancel", () => {
  it("expires the old pending payment before clearing its client recovery id", () => {
    expect(contextSource).toContain("/abandon-payment");
    expect(contextSource).toContain("pendingPaymentInvalidationRef");
    expect(contextSource).toContain('form.setValue("pendingBookingId", null');
    expect(contextSource).toContain('form.setValue("quoteLock", null');
    expect(contextSource.indexOf("if (!response.ok)"))
      .toBeLessThan(contextSource.indexOf('form.setValue("pendingBookingId", null'));
  });

  it("does not invalidate the pending payment while the customer remains on Payment", () => {
    expect(contextSource).toContain("if (currentStep === 4) return");
  });

  it("keeps the pricing hook frozen only until the stale pending id is cleared", () => {
    expect(pricingHook).toContain("if (pendingBookingId?.trim()) return");
    expect(pricingHook).toContain('setValue("pricingSummary", breakdown');
  });
});

