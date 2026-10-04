import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertHybridPayoutWithinFinancialCap } from "@/lib/payout/bookingPayoutCapCents";

describe("per-visit payout adjustment constraints", () => {
  it("allows R300 on a visit capped at R500", () => {
    const row = {
      billing_type: "prepaid",
      total_paid_cents: 50_000,
      amount_paid_cents: 50_000,
    };
    expect(assertHybridPayoutWithinFinancialCap({ row, payoutCents: 30_000, bonusCents: 0 }).ok).toBe(true);
  });

  it("rejects payout above visit financial cap", () => {
    const row = {
      billing_type: "prepaid",
      total_paid_cents: 25_000,
      amount_paid_cents: 25_000,
    };
    const result = assertHybridPayoutWithinFinancialCap({ row, payoutCents: 30_000, bonusCents: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("payout_exceeds_financial_cap");
    }
  });
});


describe("manual payout restoration removal-marker contract", () => {
  it("loads metadata and deactivates an active removal marker in the booking patch", () => {
    const source = readFileSync(join(process.cwd(), "lib/payout/adjustBookingPayoutEarnings.ts"), "utf8");
    expect(source).toMatch(/payout_frozen_cents, earnings_summary, metadata/);
    expect(source).toContain("readPayoutAttributionRemovalMarker(row.metadata)");
    expect(source).toContain("deactivatePayoutAttributionRemovalMarker(row.metadata");
    expect(source).toContain("cleared_by_admin_id: params.adminUserId");
  });
});
