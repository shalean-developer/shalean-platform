import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-13A Cleaning Credit settlement authority", () => {
  it("settles reserved Cleaning Credit synchronously before deferred post-persist work", () => {
    const src = read("lib/booking/upsertBookingFromPaystack.ts");
    const requiredRecoveryPos = src.indexOf("await runRequiredPostPersistRecovery()");
    const settlePos = src.indexOf("await settleCleaningCreditForBooking(supabase, id)", requiredRecoveryPos);
    const deferredPos = src.indexOf("const runPostPersistSideEffects", requiredRecoveryPos);
    expect(requiredRecoveryPos).toBeGreaterThanOrEqual(0);
    expect(settlePos).toBeGreaterThan(requiredRecoveryPos);
    expect(deferredPos).toBeGreaterThan(settlePos);
    expect(src).toContain('creditSettlement.error !== "reservation_not_found"');
  });

  it("gates the pre-Paystack persisted fast path on settled Cleaning Credit", () => {
    const route = read("app/api/paystack/verify/route.ts");
    const fastPathPos = route.indexOf("findPersistedPaidBooking(adminPrePaystack, reference)");
    const creditGatePos = route.indexOf('from("cleaning_credit_reservations")', fastPathPos);
    const responsePos = route.indexOf("persistedPaidBookingResponse(persistedPaid, reference, startedAt)", fastPathPos);

    expect(fastPathPos).toBeGreaterThanOrEqual(0);
    expect(creditGatePos).toBeGreaterThan(fastPathPos);
    expect(responsePos).toBeGreaterThan(creditGatePos);
    expect(route).toContain("creditReplaySafe");
    expect(route).toContain("zeroCreditReplaySafe");
    expect(route).toContain("zeroCreditReservation");
  });

  it("keeps zero-balance settlement on the same Cleaning Credit RPC boundary", () => {
    const src = read("app/api/booking-v2/confirm/route.ts");
    expect(src).toContain("await settleCleaningCreditForBooking(supabase, bookingId)");
    expect(src).toContain("await settleFullyCoveredBooking(supabase, { bookingId, payAmountZar })");
  });

  it("reclaims a released Cleaning Credit reservation when late Paystack success is finalized", () => {
    const sql = read("../../supabase/migrations/20261010213000_payment_finalize_reclaim_released_cleaning_credit.sql");

    expect(sql).toContain("if v.status = 'released' then");
    expect(sql).toContain("if v_balance < v.amount_zar then");
    expect(sql).toContain("released_credit_reclaim_insufficient_balance");
    expect(sql).toContain("credit_balance_zar = v_after");
    expect(sql).toContain("v_balance - v.amount_zar");
    expect(sql).toContain("Settled Cleaning Credit reservation after late verified payment");
    expect(sql).toContain("status = 'settled'");
  });

  it("quarantines unresolved replay credit so retry resumes the full post-persist pipeline", () => {
    const src = read("lib/booking/upsertBookingFromPaystack.ts");
    const replayPos = src.indexOf("skipped_already_persisted");
    const creditCheckPos = src.lastIndexOf('from("cleaning_credit_reservations")', replayPos);
    const quarantinePos = src.lastIndexOf('update({ status: "payment_reconciliation_required" })', replayPos);
    const recoveryPos = src.lastIndexOf("recoveryEnqueue: true", replayPos);

    expect(replayPos).toBeGreaterThanOrEqual(0);
    expect(creditCheckPos).toBeGreaterThanOrEqual(0);
    expect(creditCheckPos).toBeLessThan(replayPos);
    expect(quarantinePos).toBeGreaterThan(creditCheckPos);
    expect(recoveryPos).toBeGreaterThan(quarantinePos);
    expect(src).toContain("cleaning_credit_settlement_pending");
    expect(src).toContain('st === "payment_reconciliation_required" && input.paystackPersistSource === "retry"');
  });

  it("quarantines the paid booking when Cleaning Credit settlement cannot complete", () => {
    const src = read("lib/booking/upsertBookingFromPaystack.ts");

    expect(src).toContain("cleaning_credit_settlement_failed:");
    expect(src).toContain('update({ status: "payment_reconciliation_required" })');
    expect(src).toContain('reason: "finalization_failed"');
    expect(src).toContain("recoveryEnqueue: true");
  });

  it("terminal expiration remains release-not-settle", () => {
    const src = read("lib/booking/expirePendingPaymentTerminal.ts");
    expect(src).toContain("releaseCleaningCreditForBooking");
    expect(src).not.toContain("settleCleaningCreditForBooking");
  });
});
