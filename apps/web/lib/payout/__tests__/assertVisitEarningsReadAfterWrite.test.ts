import { describe, expect, it, vi } from "vitest";
import { assertVisitEarningsReadAfterWrite } from "@/lib/payout/assertVisitEarningsReadAfterWrite";

const BOOKING_ID = "8a798b9e-4998-48bd-88c8-afd563e9686b";
const MEMBER = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";

vi.mock("@/lib/admin/payouts/officePayoutPeriodReport", () => ({
  loadRosterByBookingIds: vi.fn(async () => new Map()),
  loadTeamJobMemberPayoutsByBookingIds: vi.fn(async () =>
    new Map([[BOOKING_ID, [{ cleaner_id: MEMBER, payout_cents: 30000 }]]]),
  ),
  perCleanerAllocationsForBooking: vi.fn((_b, _r, team) =>
    (team ?? []).map((row: { cleaner_id: string; payout_cents: number }) => ({
      cleaner_id: row.cleaner_id,
      cents: row.payout_cents,
    })),
  ),
}));

describe("assertVisitEarningsReadAfterWrite", () => {
  it("passes when effective allocation matches requested total", async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              id: BOOKING_ID,
              cleaner_id: null,
              earnings_summary: null,
            },
            error: null,
          })),
        })),
      })),
    }));
    const result = await assertVisitEarningsReadAfterWrite({ from } as never, {
      bookingId: BOOKING_ID,
      cleanerId: MEMBER,
      expectedTotalCents: 30000,
    });
    expect(result).toEqual({ ok: true, effectiveCents: 30000 });
  });

  it("fails closed on mismatch", async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { id: BOOKING_ID, cleaner_id: null, earnings_summary: null },
            error: null,
          })),
        })),
      })),
    }));
    const result = await assertVisitEarningsReadAfterWrite({ from } as never, {
      bookingId: BOOKING_ID,
      cleanerId: MEMBER,
      expectedTotalCents: 99999,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("read_after_write_mismatch");
  });
});
