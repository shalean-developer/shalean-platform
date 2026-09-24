import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPaymentEditSupersededSnapshot,
  readPaymentEditSupersedeMarker,
  withPaymentEditSupersedeMarker,
} from "@/lib/booking/paymentEditSupersedeMarker";

const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);
const pricingSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/hooks/useBookingV2Pricing.ts"),
  "utf8",
);
const handlerSource = readFileSync(
  join(process.cwd(), "lib/customer/customerBookingModifyHandlers.ts"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/bookings/[id]/abandon-payment/route.ts"),
  "utf8",
);
const ensureSource = readFileSync(
  join(process.cwd(), "lib/booking/ensureBookingPaymentSession.ts"),
  "utf8",
);
const replaySource = readFileSync(
  join(process.cwd(), "lib/booking/provePersistedPaystackReplay.ts"),
  "utf8",
);
const upsertSource = readFileSync(
  join(process.cwd(), "lib/booking/upsertBookingFromPaystack.ts"),
  "utf8",
);

describe("BOOKING-PAY-01 — Paystack cancel → edit → requote", () => {
  it("does not abandon a normal retry until the customer edits outside Payment", () => {
    expect(contextSource).toContain("if (currentStep === 4) return");
    expect(contextSource).toContain("form.watch((_values, info)");
    expect(contextSource).toContain('const pendingBookingId = form.getValues("pendingBookingId")');
    expect(pricingSource).toContain("if (pendingBookingId?.trim()) return;");
  });

  it("supersedes the server payment before clearing the client recovery id", () => {
    expect(contextSource).toContain("/abandon-payment");
    expect(contextSource).toContain("if (!response.ok || !json.ok)");
    expect(contextSource).toContain('form.setValue("pendingBookingId", null');
    expect(contextSource).toContain('form.setValue("quoteLock", null');
    expect(contextSource.indexOf("if (!response.ok || !json.ok)"))
      .toBeLessThan(contextSource.indexOf('form.setValue("pendingBookingId", null'));
  });

  it("uses an owner-authenticated server route", () => {
    expect(routeSource).toContain("authenticateCustomerBookingRequest");
    expect(routeSource).toContain("handleCustomerPendingPaymentAbandonForEdit");
  });

  it("checks gateway success before expiring the old pending payment", () => {
    expect(handlerSource).toContain("fetchPaystackTransactionVerify");
    expect(handlerSource).toContain('=== "success"');
    expect(handlerSource.indexOf("fetchPaystackTransactionVerify"))
      .toBeLessThan(handlerSource.indexOf('status: "payment_expired"'));
  });

  it("expires the old checkout and releases pre-payment reservations", () => {
    expect(handlerSource).toContain('status: "payment_expired"');
    expect(handlerSource).toContain("payment_link: null");
    expect(handlerSource).toContain("withPaymentEditSupersedeMarker");
    expect(handlerSource).toContain("releaseCleaningCreditForBooking");
    expect(handlerSource).toContain("reverseAppliedPromotionRedemptionsForBooking");
    expect(handlerSource).toContain("discardPendingRecurringPrepaymentForBooking");
  });

  it("blocks intentional edit-superseded expiries from payment recovery", () => {
    expect(ensureSource).toContain("isPaymentEditSupersededSnapshot");
    expect(ensureSource).toContain("This checkout was replaced after you edited the booking");
  });

  it("accepts non-pending Paystack replay only with persisted settlement evidence", () => {
    expect(replaySource).toContain("payment_completed_at");
    expect(replaySource).toContain("payment_status");
    expect(replaySource).toContain("if (!settled) return false");
  });

  it("rejects stale unpaid finalization against the superseded booking", () => {
    expect(upsertSource).toContain("payment_completed_at");
    expect(upsertSource).toContain('error: "PAYMENT_NOT_PAYABLE"');
  });
});

describe("payment edit supersede marker", () => {
  it("round-trips the old reference without exposing it as a payable state", () => {
    const snapshot = withPaymentEditSupersedeMarker(
      { serviceSlug: "regular-cleaning" },
      {
        supersededAt: "2026-09-24T12:00:00.000Z",
        paystackReference: "bps_old_reference",
      },
    );

    expect(isPaymentEditSupersededSnapshot(snapshot)).toBe(true);
    expect(readPaymentEditSupersedeMarker(snapshot)).toEqual({
      reason: "customer_edit_after_checkout",
      superseded_at: "2026-09-24T12:00:00.000Z",
      paystack_reference: "bps_old_reference",
      cleanup_done_at: null,
    });
  });
});
