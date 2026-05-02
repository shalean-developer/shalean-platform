import { describe, expect, it } from "vitest";
import { reconcileEarningsCardsWithLedger } from "@/lib/cleaner/earningsFinanceReconcile";

describe("reconcileEarningsCardsWithLedger", () => {
  it("passes when intersection rows match", () => {
    const cards = [
      { booking_id: "a", amount_cents: 100 },
      { booking_id: "b", amount_cents: 0 },
    ];
    const m = new Map<string, number>([
      ["a", 100],
      ["b", 0],
    ]);
    const r = reconcileEarningsCardsWithLedger(cards, m);
    expect(r.ok).toBe(true);
    expect(r.invariant_failed).toBe(false);
    expect(r.delta_intersection_cents).toBe(0);
    expect(r.amount_mismatch_booking_count).toBe(0);
    expect(r.sum_card_intersection_cents).toBe(100);
    expect(r.sum_ledger_intersection_cents).toBe(100);
  });

  it("fails on per-row amount mismatch", () => {
    const cards = [{ booking_id: "a", amount_cents: 100 }];
    const m = new Map<string, number>([["a", 99]]);
    const r = reconcileEarningsCardsWithLedger(cards, m);
    expect(r.ok).toBe(false);
    expect(r.invariant_failed).toBe(true);
    expect(r.delta_intersection_cents).toBe(1);
    expect(r.amount_mismatch_booking_count).toBe(1);
  });

  it("does not fail solely on missing ledger (expected until finalize)", () => {
    const cards = [{ booking_id: "solo", amount_cents: 200 }];
    const m = new Map<string, number>();
    const r = reconcileEarningsCardsWithLedger(cards, m);
    expect(r.ok).toBe(true);
    expect(r.invariant_failed).toBe(false);
    expect(r.missing_ledger_row_count).toBe(1);
    expect(r.intersection_booking_count).toBe(0);
  });

  it("strict mode fails when ledger row missing for positive card", () => {
    const cards = [{ booking_id: "solo", amount_cents: 200 }];
    const m = new Map<string, number>();
    const r = reconcileEarningsCardsWithLedger(cards, m, { strict: true });
    expect(r.ok).toBe(false);
    expect(r.invariant_failed).toBe(true);
  });
});
