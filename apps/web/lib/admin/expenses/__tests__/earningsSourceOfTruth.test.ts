import { describe, expect, it } from "vitest";
import { resolveBookingWideCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveBookingProfitabilityCleanerCost } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";

describe("cleaner earnings source of truth", () => {
  it("keeps solo booking finance cost aligned with the cleaner display lock", () => {
    const booking = {
      is_team_job: false,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 99_999,
    };

    expect(resolveBookingWideCleanerEarningsCents(booking).cleaner_cost_cents).toBe(25_000);
    expect(resolveBookingProfitabilityCleanerCost(booking).cleaner_cost_cents).toBe(25_000);
  });

  it("uses the booking-wide total for paired non-team bookings", () => {
    const booking = {
      is_team_job: false,
      display_earnings_cents: 26_000,
      cleaner_earnings_total_cents: 52_000,
    };

    expect(resolveBookingWideCleanerEarningsCents(booking).cleaner_cost_cents).toBe(52_000);
    expect(resolveBookingProfitabilityCleanerCost(booking).cleaner_cost_cents).toBe(52_000);
  });

  it("fails closed for team jobs without a positive booking-wide total", () => {
    const booking = {
      is_team_job: true,
      display_earnings_cents: 27_000,
      cleaner_earnings_total_cents: null,
    };

    expect(resolveBookingWideCleanerEarningsCents(booking)).toMatchObject({
      cleaner_cost_cents: null,
      incomplete_team_earnings: true,
      included_in_trusted_totals: false,
    });
    expect(resolveBookingProfitabilityCleanerCost(booking)).toMatchObject({
      cleaner_cost_cents: null,
      incomplete_team_earnings: true,
      included_in_trusted_totals: false,
      warning: "Incomplete team earnings",
    });
  });
});
