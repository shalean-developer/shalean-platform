import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-13A Cleaning Credit settlement authority", () => {
  it("settles reserved Cleaning Credit from authoritative Paystack success finalization", () => {
    const src = read("lib/booking/upsertBookingFromPaystack.ts");
    const sideEffectsPos = src.indexOf("await recordBookingSideEffects");
    const settlePos = src.indexOf("await settleCleaningCreditForBooking(supabase, id)", sideEffectsPos);
    const referralPos = src.indexOf("processCustomerReferralAfterFirstPaidBooking", settlePos);
    expect(sideEffectsPos).toBeGreaterThanOrEqual(0);
    expect(settlePos).toBeGreaterThan(sideEffectsPos);
    expect(referralPos).toBeGreaterThan(settlePos);
    expect(src).toContain('creditSettlement.error !== "reservation_not_found"');
  });

  it("keeps zero-balance settlement on the same Cleaning Credit RPC boundary", () => {
    const src = read("app/api/booking-v2/confirm/route.ts");
    expect(src).toContain("await settleCleaningCreditForBooking(supabase, bookingId)");
    expect(src).toContain("await settleFullyCoveredBooking(supabase, { bookingId, payAmountZar })");
  });

  it("reclaims a released Cleaning Credit reservation when late Paystack success is finalized", () => {
    const sql = read("../../supabase/migrations/20261010213000_payment_finalize_reclaim_released_cleaning_credit.sql");

    expect(sql).toContain("if v.status = 'released' then");
    expect(sql).toContain("credit_balance_zar = v_after");
    expect(sql).toContain("v_balance - v.amount_zar");
    expect(sql).toContain("Settled Cleaning Credit reservation after late verified payment");
    expect(sql).toContain("status = 'settled'");
  });

  it("terminal expiration remains release-not-settle", () => {
    const src = read("lib/booking/expirePendingPaymentTerminal.ts");
    expect(src).toContain("releaseCleaningCreditForBooking");
    expect(src).not.toContain("settleCleaningCreditForBooking");
  });
});
