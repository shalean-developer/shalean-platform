import { describe, expect, it } from "vitest";
import { assertAuthoritativePricingClientAvailable } from "@/lib/booking-v2/authoritativePricingClientAvailability";

describe("SPC-01-04 SR-04D2 authoritative pricing client availability", () => {
  it("allows a configured pricing client in every deployment environment", () => {
    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: true,
        env: { SHALEAN_APP_ENV: "production" },
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: true,
        env: { SHALEAN_APP_ENV: "preview" },
      }),
    ).not.toThrow();
  });

  it("fails closed when the pricing client is unavailable in canonical customer-facing production", () => {
    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: false,
        env: { SHALEAN_APP_ENV: "production" },
      }),
    ).toThrow(/authoritative Supabase pricing client is unavailable/i);

    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: false,
        env: { VERCEL_GIT_COMMIT_REF: "main" },
      }),
    ).toThrow(/authoritative Supabase pricing client is unavailable/i);
  });

  it("preserves no-secret fallback for explicit preview, development, staging, and local environments", () => {
    for (const appEnv of ["preview", "development", "staging", "local"] as const) {
      expect(() =>
        assertAuthoritativePricingClientAvailable({
          adminAvailable: false,
          env: { SHALEAN_APP_ENV: appEnv },
        }),
      ).not.toThrow();
    }
  });

  it("does not mistake production-mode preview or local builds for customer-facing production", () => {
    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: false,
        env: { NODE_ENV: "production", VERCEL: "1" },
      }),
    ).not.toThrow();

    expect(() =>
      assertAuthoritativePricingClientAvailable({
        adminAvailable: false,
        env: { NODE_ENV: "production" },
      }),
    ).not.toThrow();
  });
});
