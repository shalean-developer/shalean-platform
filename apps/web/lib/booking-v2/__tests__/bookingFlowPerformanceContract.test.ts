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

  it("separates persisted confirmation from payment initialization", () => {
    const confirm = source("app/api/booking-v2/confirm/route.ts");
    const session = source("app/api/bookings/[id]/payment-session/route.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(confirm).not.toContain("prepareConfirmedBookingPaymentSession");
    expect(confirm).not.toContain("ensureBookingPaymentSession");
    expect(confirm).toContain("paymentPreparationToken");
    expect(confirm).toContain("booking-persist;dur=");
    expect(session).toContain("verifyFreshPaymentPreparationToken");
    expect(session).toContain("freshAttempt");
    expect(session).toContain("payment-session-total;dur=");
    expect(payment).toContain("paymentPreparationToken: confirmJson.paymentPreparationToken");
  });

  it("bounds payment preparation and preserves retry recovery", () => {
    const paymentSession = source("lib/booking/ensureBookingPaymentSession.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(paymentSession).toContain("PAYSTACK_INITIALIZE_TIMEOUT_MS");
    expect(paymentSession).toContain("signal: AbortSignal.timeout(PAYSTACK_INITIALIZE_TIMEOUT_MS)");
    expect(payment).toContain("BOOKING_CONFIRM_TIMEOUT_MS");
    expect(payment).toContain("PAYMENT_RECOVERY_TIMEOUT_MS");
    expect(payment).toContain("PAYMENT_RECOVERY_TIMEOUT_MS = 30_000");
    expect(payment).toContain("BOOKING_CONFIRM_TIMEOUT_MS = 30_000");
    expect(payment).toContain("fetchPaymentPreparation");
    expect(payment).toContain("confirmedBookingId");
    expect(payment).toContain("Booking confirmation took too long. No payment was taken");
    expect(payment).toContain("Secure payment preparation took too long. Your booking is saved");
    expect(payment).toContain("setPendingBookingId(bookingId)");
  });

  it("treats referral-credit request cleanup as expected cancellation", () => {
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(payment).toContain("if (!session?.access_token || controller.signal.aborted) return");
    expect(payment).toContain("if (controller.signal.aborted) return");
    expect(payment).toContain("return () => controller.abort()");
  });

  it("uses persisted payment recovery before a remote Paystack retry", () => {
    const verify = source("app/api/paystack/verify/route.ts");
    const success = source("app/booking/success/page.tsx");
    const payReturn = source("app/pay/[bookingId]/page.tsx");

    expect(verify).toContain("findPersistedPaidBooking");
    expect(verify).toContain('X-Booking-Verify-Path": "persisted"');
    expect(success).toContain("/api/paystack/status?");
    expect(success).toContain("recoverPersistedPaidBooking");
    expect(success).toContain("VERIFY_MAX_ATTEMPTS = 2");
    expect(success).toContain("OWNED_BOOKING_FETCH_TIMEOUT_MS");
    expect(payReturn).toContain("bookingId=${encodeURIComponent(bookingId)}");
  });

  it("renders payment recovery from the owned server booking instead of a tab-local draft", () => {
    const summaryRoute = source("app/api/bookings/[id]/payment-summary/route.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(summaryRoute).toContain("resolveBookingRouteBearerAuth");
    expect(summaryRoute).toContain("resolveBookingOwnershipColumn");
    expect(summaryRoute).toContain('.eq(ownershipColumn, auth.userId)');
    expect(summaryRoute).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(summaryRoute).toContain("estimated_total: amountZar");
    expect(summaryRoute).toContain('normalizedPaymentStatus === "success"');
    expect(summaryRoute).toContain("bookingSnapshot: data.booking_snapshot");
    expect(payment).toContain("/payment-summary");
    expect(payment).toContain("pendingSummary?.pricingSummary");
    expect(payment).toContain("pendingSummary?.amountZar");
    expect(payment).toContain("!pendingBookingId ? <div");
    expect(payment).toContain("Boolean(pendingSummary && !pendingSummaryLoading)");
  });

  it("deduplicates adjacent booking reads and avoids a new-booking summary round trip", () => {
    const cleanerSection = source("src/features/booking-v2/components/CleanerPreferenceSection.tsx");
    const review = source("src/features/booking-v2/steps/Step3Review.tsx");
    const pricing = source("src/features/booking-v2/hooks/useBookingV2Pricing.ts");
    const payment = source("src/features/booking-v2/steps/Step4Payment.tsx");

    expect(cleanerSection).toContain("available-cleaners:${url}");
    expect(review).toContain("available-cleaners:${url}");
    expect(pricing).toContain("booking-quote:${requestBody}");
    expect(payment).toContain("Confirmation already returned the server-authoritative amount");
    expect(payment).toContain("setPendingSummary({");
  });
});
