import { describe, expect, it } from "vitest";
import { resolveBookingProfitabilityCleanerCost } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";

describe("paired non-team booking profitability", () => {
  it("uses booking-wide total when a paired Standard booking stores two equal cleaner locks", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: false,
      display_earnings_cents: 26_000,
      cleaner_earnings_total_cents: 52_000,
    });
    expect(result.cleaner_cost_cents).toBe(52_000);
    expect(result.included_in_trusted_totals).toBe(true);
  });

  it("keeps the display lock for ordinary solo bookings with an unrelated stale total", () => {
    const result = resolveBookingProfitabilityCleanerCost({
      is_team_job: false,
      display_earnings_cents: 25_000,
      cleaner_earnings_total_cents: 99_999,
    });
    expect(result.cleaner_cost_cents).toBe(25_000);
  });
});
