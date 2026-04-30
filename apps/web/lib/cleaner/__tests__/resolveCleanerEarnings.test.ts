import { describe, expect, it } from "vitest";
import { resolveCleanerEarningsCents, resolveCleanerFrozenCentsForSettlement } from "@/lib/cleaner/resolveCleanerEarnings";

describe("resolveCleanerEarningsCents", () => {
  it("prefers positive cleaner_earnings_total_cents over frozen and display", () => {
    expect(
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: 42_000,
        payout_frozen_cents: 50_000,
        display_earnings_cents: 30_000,
      }),
    ).toBe(42_000);
  });

  it("ignores zero line total and uses frozen/display", () => {
    expect(
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: 0,
        payout_frozen_cents: 25_000,
        display_earnings_cents: 10_000,
      }),
    ).toBe(25_000);
  });

  it("prefers positive frozen over display", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: 30_000,
        display_earnings_cents: 25_000,
      }),
    ).toBe(30_000);
  });

  it("uses display when frozen missing", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: null,
        display_earnings_cents: 25_000,
      }),
    ).toBe(25_000);
  });

  it("ignores zero frozen when display is positive (inconsistent legacy rows)", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: 0,
        display_earnings_cents: 25_000,
      }),
    ).toBe(25_000);
  });

  it("returns zero display when frozen missing", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: null,
        display_earnings_cents: 0,
      }),
    ).toBe(0);
  });

  it("returns null when neither is set", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: null,
        display_earnings_cents: null,
      }),
    ).toBeNull();
  });
});

describe("resolveCleanerFrozenCentsForSettlement", () => {
  it("prefers display over cleaner_payout", () => {
    expect(
      resolveCleanerFrozenCentsForSettlement({
        display_earnings_cents: 20_000,
        cleaner_payout_cents: 15_000,
      }),
    ).toBe(20_000);
  });

  it("falls back to cleaner_payout", () => {
    expect(
      resolveCleanerFrozenCentsForSettlement({
        display_earnings_cents: null,
        cleaner_payout_cents: 15_000,
      }),
    ).toBe(15_000);
  });

  it("accepts zero display for settlement basis", () => {
    expect(
      resolveCleanerFrozenCentsForSettlement({
        display_earnings_cents: 0,
        cleaner_payout_cents: 15_000,
      }),
    ).toBe(0);
  });
});
