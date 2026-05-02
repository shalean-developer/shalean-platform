import { describe, expect, it } from "vitest";
import { computeEarningsFinanceShadow } from "@/lib/cleaner/earningsLedgerShadowTotals";

describe("computeEarningsFinanceShadow", () => {
  it("aligns when card buckets map to ledger slice", () => {
    const cards = [
      {
        booking_id: "a",
        amount_cents: 50,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
      },
      {
        booking_id: "b",
        amount_cents: 100,
        payout_status: "eligible",
        in_frozen_batch: false,
        is_team_job: false,
      },
    ];
    const ledger = [
      { booking_id: "a", amount_cents: 50, status: "pending" },
      { booking_id: "b", amount_cents: 100, status: "approved" },
    ];
    const s = computeEarningsFinanceShadow(cards, ledger);
    expect(s.shadow_mismatch).toBe(false);
    expect(s.bucket_aligned).toBe(true);
    expect(s.delta_all_cents).toBe(0);
    expect(s.missing_ledger_expected_count).toBe(0);
  });

  it("counts missing ledger when solo total is finalized on booking", () => {
    const cards = [
      {
        booking_id: "x",
        amount_cents: 80,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        cleaner_earnings_total_cents: 80,
      },
    ];
    const s = computeEarningsFinanceShadow(cards, []);
    expect(s.missing_ledger_expected_count).toBe(1);
  });
});
