import { describe, expect, it, vi } from "vitest";

import { remapEarningsSummaryCleanerId, type BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import { healBookingCleanerEarningsSnapshotOwnershipIfNeeded } from "@/lib/payout/healBookingCleanerEarningsSnapshotOwnership";

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

const MAGARET = "2ba4ac8f-f271-4ce3-9811-58dbca218dc1";
const LUCIA = "72642f1a-4745-47e1-9a13-1edbb19b20d0";
const BOOKING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function soloSummary(cleanerId: string): BookingEarningsSummary {
  return {
    model_version: "v1",
    service_type: "standard",
    customer_total_cents: 60000,
    eligible_amount_cents: 60000,
    payout_mode: "individual_cleaners",
    cleaner_count: 1,
    assigned_cleaner_ids: [cleanerId],
    assigned_team_id: null,
    team_leader_id: cleanerId,
    cleaner_tenure_months: 1,
    cleaner_percentage: 45,
    minimum_earning_cents: 0,
    maximum_earning_cents: 999999,
    fixed_service_payout_applied: false,
    per_cleaner_earnings: [
      {
        cleaner_id: cleanerId,
        role: "lead",
        base_earning_cents: 27120,
        bonus_cents: 0,
        deduction_cents: 0,
        total_cents: 27120,
      },
    ],
    team_leader_earning_cents: 27120,
    bonus: { items: [], total_cents: 0 },
    deductions: { items: [], total_cents: 0 },
    total_cleaner_earnings_cents: 27120,
    costs_cents: 0,
    company_revenue_cents: 32880,
    computed_at: "2026-07-23T12:00:00.000Z",
  };
}

describe("remapEarningsSummaryCleanerId", () => {
  it("remaps Magaret → Lucia without changing cents", () => {
    const remapped = remapEarningsSummaryCleanerId(soloSummary(MAGARET), MAGARET, LUCIA);
    expect(remapped).not.toBeNull();
    expect(remapped!.per_cleaner_earnings[0]?.cleaner_id).toBe(LUCIA);
    expect(remapped!.per_cleaner_earnings[0]?.total_cents).toBe(27120);
    expect(remapped!.assigned_cleaner_ids).toEqual([LUCIA]);
    expect(remapped!.team_leader_id).toBe(LUCIA);
  });

  it("returns null when already on target cleaner", () => {
    expect(remapEarningsSummaryCleanerId(soloSummary(LUCIA), MAGARET, LUCIA)).toBeNull();
  });
});

describe("healBookingCleanerEarningsSnapshotOwnershipIfNeeded", () => {
  it("updates snapshot cleaner_id when drifted from expected owner", async () => {
    const snapshotUpdates: Array<Record<string, unknown>> = [];
    const bookingUpdates: Array<Record<string, unknown>> = [];

    const admin = {
      from(table: string) {
        if (table === "booking_cleaner_earnings_snapshot") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { booking_id: BOOKING, cleaner_id: MAGARET },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(patch: Record<string, unknown>) {
              return {
                eq() {
                  return {
                    eq() {
                      snapshotUpdates.push(patch);
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "bookings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { earnings_summary: soloSummary(MAGARET) },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(patch: Record<string, unknown>) {
              return {
                eq() {
                  bookingUpdates.push(patch);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await healBookingCleanerEarningsSnapshotOwnershipIfNeeded({
      admin: admin as never,
      bookingId: BOOKING,
      expectedCleanerId: LUCIA,
    });

    expect(result.healed).toBe(true);
    expect(result.previousCleanerId).toBe(MAGARET);
    expect(snapshotUpdates[0]?.cleaner_id).toBe(LUCIA);
    expect((bookingUpdates[0]?.earnings_summary as BookingEarningsSummary).per_cleaner_earnings[0]?.cleaner_id).toBe(
      LUCIA,
    );
  });
});
