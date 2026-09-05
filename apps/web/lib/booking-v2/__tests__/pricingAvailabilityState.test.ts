import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOKING_PRICING_UNAVAILABLE_MESSAGE,
  canEnterBookingPayment,
  type BookingPricingAvailability,
} from "@/lib/booking-v2/bookingPricingAvailability";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SPC-01-04 SR-04D1 pricing availability state", () => {
  it("allows payment entry only when the booking catalog is available", () => {
    const cases: Array<[BookingPricingAvailability, boolean]> = [
      ["loading", false],
      ["available", true],
      ["unavailable", false],
    ];

    for (const [availability, expected] of cases) {
      expect(canEnterBookingPayment(availability)).toBe(expected);
    }
    expect(BOOKING_PRICING_UNAVAILABLE_MESSAGE).toMatch(/pricing is temporarily unavailable/i);
  });

  it("propagates catalog fetch failure and blocks step 4 navigation", () => {
    const src = read("src/features/booking-v2/BookingV2Context.tsx");

    expect(src).toMatch(/useState<BookingPricingAvailability>\("loading"\)/);
    expect(src).toMatch(/if \(!json\.catalog\) throw new Error\("catalog_missing"\)/);
    expect(src).toMatch(/setPricingAvailability\("available"\)/);
    expect(src).toMatch(/\.catch\(\(\) => \{\s*setPricingAvailability\("unavailable"\)/s);
    expect(src).toMatch(/step === 3 && pricingAvailability !== "available"/);
    expect(src).toMatch(/step === 4 && pricingAvailability !== "available"/);
  });

  it("replaces or disables payment UI when pricing is unavailable", () => {
    const src = read("src/features/booking-v2/BookingV2Shell.tsx");

    expect(src).toMatch(/currentStep === 4 && pricingUnavailable/);
    expect(src).toMatch(/<PricingUnavailableNotice \/>/);
    expect(src).toMatch(/disabled=\{currentStep === 3 && !paymentEntryAllowed\}/);
    expect(src).toContain("BOOKING_PRICING_UNAVAILABLE_MESSAGE");
  });

  it("preserves the no-admin static catalog path and does not add SR-04D2", () => {
    const loader = read("lib/booking-v2/loadBookingV2Catalog.ts");

    expect(loader).toMatch(/const admin = getSupabaseAdmin\(\);/);
    expect(loader).toMatch(/if \(admin\) \{/);
    expect(loader).not.toMatch(/isCustomerFacingProduction/);
    expect(loader).not.toMatch(/assertAuthoritativePricingClientAvailable/);
  });
});
