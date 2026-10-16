import { describe, expect, it } from "vitest";
import { resolveBookingWideCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveBookingProfitabilityCleanerCost, trustedBookingRollupContribution, computeBookingProfitabilityRow } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";

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


describe("October adjusted paired financial cost",()=>{
  it.each([52500,51700,0])("uses the actual %i obligation in profit and rollups",total=>{
    const b={date:"2026-10-16",is_team_job:false,display_earnings_cents:26000,
      cleaner_earnings_total_cents:52000,internal_earnings_cents:total,
      booking_cleaners:[{cleaner_id:"lead"},{cleaner_id:"member"}]};
    expect(resolveBookingProfitabilityCleanerCost(b).cleaner_cost_cents).toBe(total);
    expect(trustedBookingRollupContribution(b,66000)).toEqual({included_in_trusted_totals:true,customer_revenue_cents:66000,cleaner_cost_cents:total});
    expect(computeBookingProfitabilityRow(b,66000,0).net_booking_profit_cents).toBe(66000-total);
  });
  it("preserves May–September financial resolution",()=>{
    const b={date:"2026-09-30",is_team_job:false,display_earnings_cents:26000,
      cleaner_earnings_total_cents:52000,internal_earnings_cents:52500,
      booking_cleaners:[{cleaner_id:"lead"},{cleaner_id:"member"}]};
    expect(resolveBookingProfitabilityCleanerCost(b).cleaner_cost_cents).toBe(52000);
  });
  it("does not let a solo internal aggregate override the display lock",()=>{
    expect(resolveBookingProfitabilityCleanerCost({date:"2026-10-16",is_team_job:false,
      display_earnings_cents:26000,cleaner_earnings_total_cents:99999,internal_earnings_cents:99999,
      booking_cleaners:[{cleaner_id:"lead"}]}).cleaner_cost_cents).toBe(26000);
  });
});
