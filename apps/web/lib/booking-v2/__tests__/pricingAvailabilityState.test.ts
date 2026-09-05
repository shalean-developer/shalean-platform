import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOKING_PRICING_LOADING_MESSAGE,
  BOOKING_PRICING_UNAVAILABLE_MESSAGE,
  canEnterBookingPayment,
  type BookingPricingAvailability,
} from "@/lib/booking-v2/bookingPricingAvailability";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("SPC-01-04 SR-04D1 pricing availability state", () => {
  it("blocks new payment until pricing is available but preserves pending-payment recovery", () => {
    const cases: Array<[BookingPricingAvailability, boolean]> = [
      ["loading", false],
      ["available", true],
      ["unavailable", false],
    ];

    for (const [availability, expected] of cases) {
      expect(canEnterBookingPayment(availability)).toBe(expected);
      expect(canEnterBookingPayment(availability, true)).toBe(true);
    }
    expect(BOOKING_PRICING_LOADING_MESSAGE).toMatch(/loading live pricing/i);
    expect(BOOKING_PRICING_UNAVAILABLE_MESSAGE).toMatch(/pricing is temporarily unavailable/i);
  });

  it("propagates catalog failure and uses pending-aware navigation gates", () => {
    const src = read("src/features/booking-v2/BookingV2Context.tsx");

    expect(src).toMatch(/useState<BookingPricingAvailability>\("loading"\)/);
    expect(src).toMatch(/if \(!json\.catalog\) throw new Error\("catalog_missing"\)/);
    expect(src).toMatch(/setPricingAvailability\("available"\)/);
    expect(src).toMatch(/\.catch\(\(\) => \{\s*setPricingAvailability\("unavailable"\)/);
    expect(src).toContain('form.getValues("pendingBookingId")?.trim()');
    expect(src).toContain("canEnterBookingPayment(pricingAvailability, hasPendingBooking)");
    expect(src).toContain("if (step === 3)");
    expect(src).toContain("if (step === 4)");
  });

  it("blocks direct Step 4 while loading or unavailable unless a pending booking exists", () => {
    const src = read("src/features/booking-v2/BookingV2Shell.tsx");

    expect(src).toContain('watch("pendingBookingId")');
    expect(src).toContain("canEnterBookingPayment(pricingAvailability, hasPendingBooking)");
    expect(src).toContain("currentStep === 4 && !paymentEntryAllowed");
    expect(src).toContain("<PricingBlockedNotice availability={pricingAvailability} />");
    expect(src).toContain("BOOKING_PRICING_LOADING_MESSAGE");
    expect(src).toContain("BOOKING_PRICING_UNAVAILABLE_MESSAGE");
    expect(src).toMatch(/disabled=\{currentStep === 3 && !paymentEntryAllowed\}/);
  });

  it("preserves the server-owned pending payment-session recovery path", () => {
    const src = read("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(src).toContain("const canStartPayment = Boolean(pendingBookingId) || quoteReadiness.ready");
    expect(src).toContain("if (pendingBookingId)");
    expect(src).toContain("/payment-session");
    expect(src).toContain("only fall through when a new canonical quote is ready");
    expect(src).toContain("if (!quoteReadiness.ready)");
  });

  it("preserves the no-admin static catalog path and does not add SR-04D2", () => {
    const loader = read("lib/booking-v2/loadBookingV2Catalog.ts");

    expect(loader).toMatch(/const admin = getSupabaseAdmin\(\);/);
    expect(loader).toMatch(/if \(admin\) \{/);
    expect(loader).not.toMatch(/isCustomerFacingProduction/);
    expect(loader).not.toMatch(/assertAuthoritativePricingClientAvailable/);
  });
});
