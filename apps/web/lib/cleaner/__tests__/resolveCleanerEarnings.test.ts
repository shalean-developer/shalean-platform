import { describe, expect, it } from "vitest";
import { resolveCleanerEarningsCents, resolveCleanerFrozenCentsForSettlement } from "@/lib/cleaner/resolveCleanerEarnings";

describe("resolveCleanerEarningsCents", () => {
  it("prefers positive frozen over display", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: 30_000,
        display_earnings_cents: 25_000,
      }),
    ).toBe(30_000);
  });

  it("uses display when frozen missing or zero", () => {
    expect(
      resolveCleanerEarningsCents({
        payout_frozen_cents: null,
        display_earnings_cents: 25_000,
      }),
    ).toBe(25_000);
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
});
