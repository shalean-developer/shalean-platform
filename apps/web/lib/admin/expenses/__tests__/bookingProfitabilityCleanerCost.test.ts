import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_TEAM_EARNINGS_WARNING,
  computeBookingProfitabilityRow,
  resolveBookingProfitabilityCleanerCost,
  sumTrustedBookingProfitTotals,
} from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";
import { computeBookingProfit } from "@/lib/admin/expenses/profitCalculations";

/** Legacy buggy path: always used one cleaner's display_earnings_cents. */
function legacyCleanerCostCents(booking: {
  display_earnings_cents?: number | null;
}): number {
  return Math.max(0, Math.round(Number(booking.display_earnings_cents) || 0));
}

describe("resolveBookingProfitabilityCleanerCost", () => {
  it("uses display_earnings_cents for non-team bookings", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: false,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 99_999,
    });
    expect(result).toEqual({
      cleaner_cost_cents: 25_000,
      incomplete_team_earnings: false,
      warning: null,
      included_in_trusted_totals: true,
    });
  });

  it("treats null/undefined is_team_job as solo and uses display_earnings_cents", () => {
    expect(
      resolveBookingProfitabilityCleanerCost({
        is_team_job: null,
        display_earnings_cents: 18_000,
        cleaner_earnings_total_cents: null,
      }).cleaner_cost_cents,
    ).toBe(18_000);
  });

  it("uses cleaner_earnings_total_cents for team jobs", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: true,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 127_000,
    });
    expect(result.cleaner_cost_cents).toBe(127_000);
    expect(result.incomplete_team_earnings).toBe(false);
    expect(result.included_in_trusted_totals).toBe(true);
  });

  it("never silently falls back to display_earnings_cents for team jobs", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: true,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: null,
    });
    expect(result.cleaner_cost_cents).toBeNull();
    expect(result.incomplete_team_earnings).toBe(true);
    expect(result.warning).toBe(INCOMPLETE_TEAM_EARNINGS_WARNING);
    expect(result.included_in_trusted_totals).toBe(false);
    expect(result.cleaner_cost_cents).not.toBe(25_000);
  });

  it.each([
    { teamSize: 2, memberCents: [30_000, 30_000], totalCents: 60_000 },
    { teamSize: 3, memberCents: [40_000, 40_000, 40_000], totalCents: 120_000 },
    { teamSize: 5, memberCents: [25_000, 25_000, 25_000, 26_000, 26_000], totalCents: 127_000 },
    {
      teamSize: 9,
      memberCents: [20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000],
      totalCents: 180_000,
    },
  ])(
    "uses team total for a $teamSize-person team (not one member's display earnings)",
    ({ memberCents, totalCents }) => {
      const leadDisplay = memberCents[0]!;
      expect(memberCents.reduce((a, b) => a + b, 0)).toBe(totalCents);

      const cost = resolveBookingProfitabilityCleanerCost({
        is_team_job: true,
        display_earnings_cents: leadDisplay,
        cleaner_earnings_total_cents: totalCents,
      });

      expect(cost.cleaner_cost_cents).toBe(totalCents);
      expect(cost.cleaner_cost_cents).not.toBe(leadDisplay);
      expect(legacyCleanerCostCents({ display_earnings_cents: leadDisplay })).toBe(leadDisplay);
    },
  );

  it("regression: five-person team totaling R1,270 must not display R250", () => {
    const booking = {
      is_team_job: true as const,
      // Lead cleaner display (one of five) — the old bug surface.
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 127_000,
    };

    expect(legacyCleanerCostCents(booking)).toBe(25_000); // R250 before
    const fixed = resolveBookingProfitabilityCleanerCost(booking);
    expect(fixed.cleaner_cost_cents).toBe(127_000); // R1,270 after
    expect(fixed.cleaner_cost_cents).not.toBe(25_000);

    const customer = 250_000;
    const before = computeBookingProfit(customer, legacyCleanerCostCents(booking), 0);
    const after = computeBookingProfitabilityRow(booking, customer, 0);
    expect(before.cleaner_payment_cents).toBe(25_000);
    expect(before.net_booking_profit_cents).toBe(225_000);
    expect(after.cleaner_payment_cents).toBe(127_000);
    expect(after.net_booking_profit_cents).toBe(123_000);
    expect(after.profit_margin_percent).toBe(49.2);
  });
});

describe("computeBookingProfitabilityRow", () => {
  it("recalculates net profit and margin from corrected cleaner cost", () => {
    const row = computeBookingProfitabilityRow(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: 90_000,
      },
      200_000,
      5_000,
      2_000,
      3_000,
    );
    expect(row.cleaner_payment_cents).toBe(90_000);
    expect(row.net_booking_profit_cents).toBe(100_000);
    expect(row.profit_margin_percent).toBe(50);
    expect(row.included_in_trusted_totals).toBe(true);
  });

  it("returns Incomplete team earnings warning and null net when team total is missing", () => {
    const row = computeBookingProfitabilityRow(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: null,
      },
      200_000,
      5_000,
    );
    expect(row.warning).toBe(INCOMPLETE_TEAM_EARNINGS_WARNING);
    expect(row.incomplete_team_earnings).toBe(true);
    expect(row.cleaner_payment_cents).toBeNull();
    expect(row.net_booking_profit_cents).toBeNull();
    expect(row.profit_margin_percent).toBeNull();
    expect(row.included_in_trusted_totals).toBe(false);
  });
});

describe("sumTrustedBookingProfitTotals", () => {
  it("excludes incomplete team bookings from trusted net-profit totals", () => {
    const complete = computeBookingProfitabilityRow(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: 127_000,
      },
      250_000,
      0,
    );
    const incomplete = computeBookingProfitabilityRow(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: null,
      },
      250_000,
      0,
    );
    const solo = computeBookingProfitabilityRow(
      {
        is_team_job: false,
        display_earnings_cents: 40_000,
        cleaner_earnings_total_cents: null,
      },
      100_000,
      0,
    );

    const totals = sumTrustedBookingProfitTotals([complete, incomplete, solo]);
    expect(totals.booking_count).toBe(2);
    expect(totals.excluded_incomplete_team_count).toBe(1);
    expect(totals.cleaner_payment_cents).toBe(127_000 + 40_000);
    expect(totals.net_booking_profit_cents).toBe(123_000 + 60_000);
  });
});
