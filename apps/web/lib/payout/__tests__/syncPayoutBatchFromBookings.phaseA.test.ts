import { describe, expect, it, vi } from "vitest";
import { syncPayoutBatchFromBookings } from "@/lib/payout/syncPayoutBatchFromBookings";

const PAYOUT_ID = "22222222-2222-4222-8222-222222222222";
const CLEANER_ID = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";
const BOOKING_ID = "8a798b9e-4998-48bd-88c8-afd563e9686b";

describe("syncPayoutBatchFromBookings team member inclusion", () => {
  it("adds batched team_job_member_payouts in the batch period", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const from = vi.fn((table: string) => {
      if (table === "cleaner_payouts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: PAYOUT_ID,
                  status: "pending",
                  cleaner_id: CLEANER_ID,
                  period_start: "2026-07-01",
                  period_end: "2026-07-31",
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            updates.push(patch);
            return {
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  select: vi.fn(async () => ({ data: [{ id: PAYOUT_ID }], error: null })),
                })),
              })),
            };
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: vi.fn((cols: string) => {
            if (cols.includes("cleaner_payout_cents")) {
              return {
                eq: vi.fn(async () => ({ data: [], error: null })),
              };
            }
            return {
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({
                    data: [{ id: BOOKING_ID, date: "2026-07-15" }],
                    error: null,
                  })),
                })),
              })),
            };
          }),
        };
      }
      if (table === "booking_roster_member_payouts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        };
      }
      if (table === "team_job_member_payouts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ booking_id: BOOKING_ID, payout_cents: 25000, status: "batched" }],
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await syncPayoutBatchFromBookings({ from } as never, PAYOUT_ID);
    expect(result).toEqual({ ok: true, totalCents: 25000 });
    expect(updates[0]?.total_amount_cents).toBe(25000);
    expect(updates[0]?.calculated_amount_cents).toBe(25000);
  });
});
