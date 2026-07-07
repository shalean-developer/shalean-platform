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
