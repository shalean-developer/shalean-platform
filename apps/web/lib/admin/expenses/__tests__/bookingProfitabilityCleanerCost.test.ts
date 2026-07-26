import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_TEAM_EARNINGS_WARNING,
  computeBookingProfitabilityRow,
  paginateBookingProfitabilityItems,
  resolveBookingProfitabilityCleanerCost,
  sumTrustedBookingProfitTotals,
  trustedBookingRollupContribution,
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

  it("treats completed team booking with team total 0 as Incomplete team earnings", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: true,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 0,
    });
    expect(result.incomplete_team_earnings).toBe(true);
    expect(result.warning).toBe(INCOMPLETE_TEAM_EARNINGS_WARNING);
    expect(result.cleaner_cost_cents).toBeNull();
    expect(result.included_in_trusted_totals).toBe(false);
  });

  it("includes complete positive team total in trusted totals", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: true,
      display_earnings_cents: 1,
      cleaner_earnings_total_cents: 1,
    });
    expect(result.included_in_trusted_totals).toBe(true);
    expect(result.cleaner_cost_cents).toBe(1);
    expect(result.incomplete_team_earnings).toBe(false);
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
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 127_000,
    };

    expect(legacyCleanerCostCents(booking)).toBe(25_000);
    const fixed = resolveBookingProfitabilityCleanerCost(booking);
    expect(fixed.cleaner_cost_cents).toBe(127_000);
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

describe("trustedBookingRollupContribution", () => {
  it("incomplete team booking contributes neither revenue nor cleaner cost to trusted margin/profit", () => {
    const incomplete = trustedBookingRollupContribution(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: null,
      },
      250_000,
    );
    expect(incomplete.included_in_trusted_totals).toBe(false);
    expect(incomplete.cleaner_cost_cents).toBeNull();
    // Operational revenue may still be known, but must not enter trusted rollups.
    expect(incomplete.customer_revenue_cents).toBe(250_000);

    const trustedOnly = [incomplete]
      .filter((c) => c.included_in_trusted_totals)
      .reduce(
        (acc, c) => {
          if (!c.included_in_trusted_totals) return acc;
          return {
            revenue: acc.revenue + c.customer_revenue_cents,
            payouts: acc.payouts + c.cleaner_cost_cents,
            bookings: acc.bookings + 1,
          };
        },
        { revenue: 0, payouts: 0, bookings: 0 },
      );

    expect(trustedOnly).toEqual({ revenue: 0, payouts: 0, bookings: 0 });
    expect(trustedOnly.revenue - trustedOnly.payouts).toBe(0);
  });

  it("complete positive team total remains included in trusted rollups", () => {
    const complete = trustedBookingRollupContribution(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: 127_000,
      },
      250_000,
    );
    expect(complete).toEqual({
      included_in_trusted_totals: true,
      customer_revenue_cents: 250_000,
      cleaner_cost_cents: 127_000,
    });
  });

  it("completed team booking with team total 0 is excluded from trusted rollups", () => {
    const zeroTotal = trustedBookingRollupContribution(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: 0,
      },
      250_000,
    );
    expect(zeroTotal.included_in_trusted_totals).toBe(false);
    expect(zeroTotal.cleaner_cost_cents).toBeNull();
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

  it("excludes completed team booking with team total 0 from trusted profit", () => {
    const row = computeBookingProfitabilityRow(
      {
        is_team_job: true,
        display_earnings_cents: 25_000,
        cleaner_earnings_total_cents: 0,
      },
      200_000,
      0,
    );
    expect(row.warning).toBe(INCOMPLETE_TEAM_EARNINGS_WARNING);
    expect(row.included_in_trusted_totals).toBe(false);
    expect(row.net_booking_profit_cents).toBeNull();
  });
});

describe("sumTrustedBookingProfitTotals + pagination", () => {
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
    expect(totals.customer_payment_cents).toBe(250_000 + 100_000);
    expect(totals.cleaner_payment_cents).toBe(127_000 + 40_000);
    expect(totals.net_booking_profit_cents).toBe(123_000 + 60_000);
  });

  it("trusted totals remain identical across pagination pages", () => {
    const periodRows = [
      computeBookingProfitabilityRow(
        { is_team_job: true, display_earnings_cents: 25_000, cleaner_earnings_total_cents: 127_000 },
        250_000,
        0,
      ),
      computeBookingProfitabilityRow(
        { is_team_job: true, display_earnings_cents: 25_000, cleaner_earnings_total_cents: null },
        250_000,
        0,
      ),
      computeBookingProfitabilityRow(
        { is_team_job: false, display_earnings_cents: 40_000, cleaner_earnings_total_cents: null },
        100_000,
        0,
      ),
      computeBookingProfitabilityRow(
        { is_team_job: true, display_earnings_cents: 10_000, cleaner_earnings_total_cents: 0 },
        80_000,
        0,
      ),
      computeBookingProfitabilityRow(
        { is_team_job: true, display_earnings_cents: 20_000, cleaner_earnings_total_cents: 60_000 },
        150_000,
        0,
      ),
    ];

    const periodTrusted = sumTrustedBookingProfitTotals(periodRows);
    expect(periodTrusted.booking_count).toBe(3);
    expect(periodTrusted.excluded_incomplete_team_count).toBe(2);

    const page1 = paginateBookingProfitabilityItems(periodRows, 1, 2);
    const page2 = paginateBookingProfitabilityItems(periodRows, 2, 2);
    const page3 = paginateBookingProfitabilityItems(periodRows, 3, 2);

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page3.items).toHaveLength(1);

    // Period-wide totals must not be recomputed from the page slice.
    expect(sumTrustedBookingProfitTotals(periodRows)).toEqual(periodTrusted);
    expect(sumTrustedBookingProfitTotals(periodRows)).toEqual(
      sumTrustedBookingProfitTotals([...page1.items, ...page2.items, ...page3.items]),
    );

    // Page-only sums differ from period totals — proving why totals must be period-wide.
    expect(sumTrustedBookingProfitTotals(page1.items)).not.toEqual(periodTrusted);
    expect(sumTrustedBookingProfitTotals(page2.items)).not.toEqual(periodTrusted);
  });
});
