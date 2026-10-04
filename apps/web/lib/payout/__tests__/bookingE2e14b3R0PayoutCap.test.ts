import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14B.3 R0 settled prepaid payout cap", () => {
  it("keeps unpaid prepaid rows on collected-cash semantics", () => {
    const src = read("lib/payout/bookingPayoutCapCents.ts");
    expect(src).toContain('if (normLower(row.payment_status) === "success")');
    expect(src).toContain("return collectedCap;");
  });

  it("uses persisted visit subtotal only after successful prepaid settlement", () => {
    const src = read("lib/payout/bookingPayoutCapCents.ts");
    expect(src).toContain("row.base_amount_cents");
    expect(src).toContain("Math.max(collectedCap, quotedBase)");
  });

  it("passes the visit subtotal into every app-layer payout-cap writer", () => {
    const persist = read("lib/payout/persistCleanerPayout.ts");
    const soloEdit = read("lib/payout/adjustBookingPayoutEarnings.ts");
    const teamEdit = read("lib/payout/adjustBookingTeamMemberPayoutEarnings.ts");

    expect(persist).toContain("base_amount_cents: r.base_amount_cents");
    expect(soloEdit).toContain("total_paid_zar, base_amount_cents, cleaner_payout_cents");
    expect(teamEdit).toContain("total_paid_zar, base_amount_cents, cleaner_payout_cents");
  });

  it("converges the Postgres CHECK without fabricating collected cash", () => {
    const sql = read("../../supabase/migrations/20260926120500_booking_r0_settled_service_value_payout_cap.sql");

    expect(sql).toContain("payment_status");
    expect(sql).toContain("base_amount_cents");
    expect(sql).toContain("greatest(");
    expect(sql).toContain("validate constraint bookings_cleaner_payout_lte_financial_cap");
    expect(sql).not.toMatch(/update\s+public\.bookings\s+set\s+(?:total_paid|amount_paid)/i);
    expect(sql).not.toContain("cleaning_credit_reservations");
  });
});
