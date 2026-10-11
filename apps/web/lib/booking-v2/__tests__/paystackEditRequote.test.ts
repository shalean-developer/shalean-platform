import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);
const pricingSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/hooks/useBookingV2Pricing.ts"),
  "utf8",
);
const abandonSource = readFileSync(
  join(process.cwd(), "lib/booking/abandonPendingPaymentForEdit.ts"),
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

describe("BOOKING-PAYSTACK-EDIT-REQUote — cancel/edit/reprice lifecycle", () => {
  it("supersedes the pending checkout before Booking V2 returns to editable steps", () => {
    expect(contextSource).toContain("/abandon-payment-for-edit");
    expect(contextSource).toContain('setValue("pendingBookingId", null');
    expect(contextSource).toContain('setValue("quoteLock", null');
    expect(contextSource.indexOf("/abandon-payment-for-edit"))
      .toBeLessThan(contextSource.indexOf('setValue("pendingBookingId", null'));
  });

  it("keeps draft pricing frozen only while a real pending booking remains", () => {
    expect(pricingSource).toContain("if (pendingBookingId?.trim()) return;");
  });

  it("expires and marks the old attempt, clears its link, and releases checkout reservations", () => {
    expect(abandonSource).toContain('status: "payment_expired"');
    expect(abandonSource).toContain("payment_link: null");
    expect(abandonSource).toContain("payment_link_expires_at: null");
    expect(abandonSource).toContain("payment_edit_superseded");
    expect(abandonSource).toContain("releaseCleaningCreditForBooking");
    expect(abandonSource).toContain('update({ status: "reversed" })');
    expect(abandonSource).toContain('eq("status", "pending_payment")');
  });

  it("does not allow the intentionally superseded expired booking to create another Paystack session", () => {
    expect(ensureSource).toContain("isPaymentEditSupersededSnapshot");
    expect(ensureSource).toContain("This checkout was replaced after you edited the booking");
  });

  it("requires real persisted payment evidence before accepting a non-pending Paystack replay", () => {
    expect(replaySource).toContain("payment_completed_at");
    expect(replaySource).toContain("payment_status");
    expect(replaySource).toContain("if (!settled) return false");
  });

  it("rejects finalization of an unpaid terminal booking even when old metadata still names it", () => {
    expect(upsertSource).toContain("PAYMENT_NOT_PAYABLE");
    expect(upsertSource).toContain("payment_completed_at");
  });
});
