import { describe, expect, it } from "vitest";
import {
  computeEarningsFinanceShadow,
  EARNINGS_SHADOW_DELTA_DIRECTION,
  isEarningsLedgerFlipReady,
} from "@/lib/cleaner/earningsLedgerShadowTotals";

describe("computeEarningsFinanceShadow", () => {
  it("aligns when card buckets map to ledger slice", () => {
    const cards = [
      {
        booking_id: "a",
        amount_cents: 50,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        primary_completion_at_iso: "2026-01-01T10:00:00.000Z",
      },
      {
        booking_id: "b",
        amount_cents: 100,
        payout_status: "eligible",
        in_frozen_batch: false,
        is_team_job: false,
        primary_completion_at_iso: "2026-01-02T10:00:00.000Z",
      },
    ];
    const ledger = [
      { booking_id: "a", amount_cents: 50, status: "pending" },
      { booking_id: "b", amount_cents: 100, status: "approved" },
    ];
    const s = computeEarningsFinanceShadow(cards, ledger, { asOfMs: Date.parse("2026-01-10T12:00:00.000Z") });
    expect(s.shadow_mismatch).toBe(false);
    expect(s.bucket_aligned).toBe(true);
    expect(s.delta_all_cents).toBe(0);
    expect(s.delta_direction).toBe(EARNINGS_SHADOW_DELTA_DIRECTION);
    expect(s.missing_ledger_expected_count).toBe(0);
    expect(s.summary.ok).toBe(true);
  });

  it("counts missing ledger as hard when completion is old or unknown", () => {
    const cards = [
      {
        booking_id: "x",
        amount_cents: 80,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        cleaner_earnings_total_cents: 80,
        primary_completion_at_iso: "2026-01-01T10:00:00.000Z",
      },
    ];
    const s = computeEarningsFinanceShadow(cards, [], { asOfMs: Date.parse("2026-01-10T12:00:00.000Z") });
    expect(s.missing_ledger_expected_count).toBe(1);
    expect(s.missing_ledger_expected_count_hard).toBe(1);
    expect(s.missing_ledger_expected_count_soft).toBe(0);
    expect(s.delta_all_cents).toBe(80);
    expect(s.shadow_mismatch).toBe(true);
  });

  it("counts missing ledger as soft when completion is recent", () => {
    const asOfMs = Date.parse("2026-01-10T12:00:00.000Z");
    const cards = [
      {
        booking_id: "x",
        amount_cents: 80,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        cleaner_earnings_total_cents: 80,
        primary_completion_at_iso: new Date(asOfMs - 5 * 60 * 1000).toISOString(),
      },
    ];
    const s = computeEarningsFinanceShadow(cards, [], { asOfMs, missingLedgerHardAfterMs: 12 * 60 * 1000 });
    expect(s.missing_ledger_expected_count_soft).toBe(1);
    expect(s.missing_ledger_expected_count_hard).toBe(0);
    expect(s.delta_all_cents).toBe(80);
    expect(s.shadow_mismatch).toBe(true);
  });

  it("detects bucket mapping mismatch when ledger status disagrees with card", () => {
    const cards = [
      {
        booking_id: "b",
        amount_cents: 100,
        payout_status: "eligible",
        in_frozen_batch: false,
        is_team_job: false,
        primary_completion_at_iso: "2026-01-02T10:00:00.000Z",
      },
    ];
    const ledger = [{ booking_id: "b", amount_cents: 100, status: "pending" }];
    const s = computeEarningsFinanceShadow(cards, ledger, { asOfMs: Date.parse("2026-01-10T12:00:00.000Z") });
    expect(s.bucket_mapping_mismatch_count).toBe(1);
    expect(s.shadow_mismatch).toBe(true);
  });
});

describe("isEarningsLedgerFlipReady", () => {
  it("is true when card and ledger agree with no hard gaps", () => {
    const cards = [
      {
        booking_id: "a",
        amount_cents: 50,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        primary_completion_at_iso: "2026-01-01T10:00:00.000Z",
      },
    ];
    const ledger = [{ booking_id: "a", amount_cents: 50, status: "pending" }];
    const s = computeEarningsFinanceShadow(cards, ledger, { asOfMs: Date.parse("2026-01-10T12:00:00.000Z") });
    expect(isEarningsLedgerFlipReady(s)).toBe(true);
  });

  it("is false when hard missing ledger is present", () => {
    const cards = [
      {
        booking_id: "x",
        amount_cents: 80,
        payout_status: "pending",
        in_frozen_batch: false,
        is_team_job: false,
        cleaner_earnings_total_cents: 80,
        primary_completion_at_iso: "2026-01-01T10:00:00.000Z",
      },
    ];
    const s = computeEarningsFinanceShadow(cards, [], { asOfMs: Date.parse("2026-01-10T12:00:00.000Z") });
    expect(isEarningsLedgerFlipReady(s)).toBe(false);
  });
});
