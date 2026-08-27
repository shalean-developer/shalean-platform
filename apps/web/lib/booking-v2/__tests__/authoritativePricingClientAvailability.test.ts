import { describe, expect, it } from "vitest";
import { assertAuthoritativePricingClientAvailable } from "@/lib/booking-v2/authoritativePricingClientAvailability";

describe("SR-04D authoritative pricing client availability", () => {
  it("allows a configured pricing client in every environment", () => {
    expect(() => assertAuthoritativePricingClientAvailable({ adminAvailable: true, nodeEnv: "production" })).not.toThrow();
    expect(() => assertAuthoritativePricingClientAvailable({ adminAvailable: true, nodeEnv: "development" })).not.toThrow();
  });

  it("fails closed in production when the pricing client is unavailable", () => {
    expect(() =>
      assertAuthoritativePricingClientAvailable({ adminAvailable: false, nodeEnv: "production" }),
    ).toThrow(/authoritative Supabase pricing client is unavailable/i);
  });

  it("preserves explicit local\/development fallback", () => {
    expect(() =>
      assertAuthoritativePricingClientAvailable({ adminAvailable: false, nodeEnv: "development" }),
    ).not.toThrow();
    expect(() =>
      assertAuthoritativePricingClientAvailable({ adminAvailable: false, nodeEnv: "test" }),
    ).not.toThrow();
  });
});
