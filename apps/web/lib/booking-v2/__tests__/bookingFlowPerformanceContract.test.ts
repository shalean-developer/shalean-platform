import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("booking flow performance contracts", () => {
  it("uses cached catalogues while leaving final confirmation on fresh pricing", () => {
    const loader = source("lib/booking-v2/loadBookingV2Catalog.ts");
    const services = source("app/api/booking-v2/services/route.ts");
    const quote = source("app/api/booking-v2/quote/route.ts");
    const confirm = source("app/api/booking-v2/confirm/route.ts");

    expect(loader).toContain("loadCachedBookingV2Catalog");
    expect(services).toContain("loadCachedBookingV2Catalog");
    expect(quote).toContain("loadCachedBookingV2Catalog");
    expect(services).toContain('"Server-Timing"');
    expect(quote).toContain('"Server-Timing"');
    expect(confirm).toContain("loadBookingV2Catalog");
    expect(confirm).not.toContain("loadCachedBookingV2Catalog");
  });

  it("resolves catalogue-backed locations without a duplicate network request", () => {
    const address = source("src/features/booking-v2/components/PropertyAddressSection.tsx");

    expect(address).toContain("selectedLocationOption");
    expect(address).toContain("!locationsLoading && !selectedLocationOption");
    expect(address).toContain("LOCATION_CACHE_TTL_MS");
  });

  it("combines confirmation and payment initialization", () => {
    const confirm = source("app/api/booking-v2/confirm/route.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(confirm).toContain("prepareConfirmedBookingPaymentSession");
    expect(confirm).toContain("freshAttempt: true");
    expect(confirm).toContain("authorizationUrl");
    expect(payment).toContain("confirmJson.authorizationUrl");
  });

  it("bounds payment preparation and preserves retry recovery", () => {
    const paymentSession = source("lib/booking/ensureBookingPaymentSession.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(paymentSession).toContain("PAYSTACK_INITIALIZE_TIMEOUT_MS");
    expect(paymentSession).toContain("signal: AbortSignal.timeout(PAYSTACK_INITIALIZE_TIMEOUT_MS)");
    expect(payment).toContain("BOOKING_CONFIRM_TIMEOUT_MS");
    expect(payment).toContain("PAYMENT_RECOVERY_TIMEOUT_MS");
    expect(payment).toContain("fetchPaymentPreparation");
    expect(payment).toContain("Secure payment preparation took too long. Your booking is saved");
    expect(payment).toContain("setPendingBookingId(bookingId)");
  });

  it("uses persisted payment recovery before a remote Paystack retry", () => {
    const verify = source("app/api/paystack/verify/route.ts");
    const success = source("app/booking/success/page.tsx");

    expect(verify).toContain("findPersistedPaidBooking");
    expect(verify).toContain('X-Booking-Verify-Path": "persisted"');
    expect(success).toContain("/api/paystack/status?");
    expect(success).toContain("VERIFY_MAX_ATTEMPTS = 1");
  });
});
