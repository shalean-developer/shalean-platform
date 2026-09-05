import { describe, expect, it } from "vitest";
import {
  todayCentsAndBreakdownFromBookings,
  type CleanerDashboardEarningsWireRow,
} from "@/lib/cleaner/cleanerDashboardTodayCents";

/**
 * Regression guard for the "Job earning vs Today earnings" boundary.
 *
 * Business rule (see audit `cleaner-pending-offer-job-earning`):
 *   - The actual configured cleaner earning ("Job earning: R___") MUST be
 *     visible on offer / next-job / upcoming cards.
 *   - That same amount MUST NOT contribute to:
 *       - dashboard `summary.today_cents`
 *       - dashboard `summary.today_breakdown`
 *       - `/cleaner/earnings` Today / Week / Month totals
 *     until the booking transitions to `status === "completed"`.
 *
 * `todayCentsAndBreakdownFromBookings` enforces this by filtering on
 * `status === "completed"` (`cleanerDashboardTodayCents.ts:119`). This
 * test pins that filter so it cannot regress.
 */
describe("todayCentsAndBreakdownFromBookings — assigned/upcoming bookings excluded", () => {
  const TODAY_AT_NINE = new Date("2026-05-13T09:00:00+02:00");

  function row(overrides: Partial<CleanerDashboardEarningsWireRow>): CleanerDashboardEarningsWireRow {
    return {
      id: "b-1",
      status: "assigned",
      date: "2026-05-13",
      completed_at: null,
      display_earnings_cents: 40000,
      ...overrides,
    } as CleanerDashboardEarningsWireRow;
  }

  it("does NOT count an assigned future booking with display_earnings_cents = R400 toward today_cents", () => {
    const out = todayCentsAndBreakdownFromBookings(
      [row({ status: "assigned", date: "2026-05-13", display_earnings_cents: 40000 })],
      TODAY_AT_NINE,
    );
    expect(out.today_cents).toBe(0);
    expect(out.today_breakdown).toEqual([]);
  });

  it("does NOT count en_route or in_progress bookings either (only completed)", () => {
    const out = todayCentsAndBreakdownFromBookings(
      [
        row({ id: "b-er", status: "en_route", display_earnings_cents: 50000 }),
        row({ id: "b-ip", status: "in_progress", display_earnings_cents: 60000 }),
      ],
      TODAY_AT_NINE,
    );
    expect(out.today_cents).toBe(0);
  });

  it("DOES count a completed booking that finished today", () => {
    const completedToday = row({
      id: "b-done",
      status: "completed",
      completed_at: "2026-05-13T10:30:00+02:00",
      cleaner_earnings_total_cents: 40000,
    });
    const out = todayCentsAndBreakdownFromBookings([completedToday], TODAY_AT_NINE);
    expect(out.today_cents).toBe(40000);
    expect(out.today_breakdown.map((b) => b.booking_id)).toContain("b-done");
  });

  it("locks the boundary: a mix of assigned (today) + completed (today) only sums the completed one", () => {
    const out = todayCentsAndBreakdownFromBookings(
      [
        row({ id: "b-up", status: "assigned", display_earnings_cents: 40000 }),
        row({
          id: "b-done",
          status: "completed",
          completed_at: "2026-05-13T11:00:00+02:00",
          cleaner_earnings_total_cents: 50000,
        }),
      ],
      TODAY_AT_NINE,
    );
    expect(out.today_cents).toBe(40000);
    expect(out.today_breakdown).toHaveLength(1);
    expect(out.today_breakdown[0]!.booking_id).toBe("b-done");
  });
});
