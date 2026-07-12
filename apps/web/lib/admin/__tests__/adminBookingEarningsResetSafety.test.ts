import { describe, expect, it, vi } from "vitest";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";

const bookingId = "11111111-1111-4111-8111-111111111111";

function mockAdmin(booking: Record<string, unknown>, opts?: { payoutBatch?: Record<string, unknown> | null; earnings?: Array<{ id: string; status: string }> }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: booking, error: null }),
            }),
          }),
        };
      }
      if (table === "cleaner_payouts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts?.payoutBatch === undefined ? null : opts.payoutBatch,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "cleaner_earnings") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: opts?.earnings ?? [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("assertBookingCleanerEarningsResetSafe", () => {
  it("blocks eligible payout_status by default", async () => {
    const admin = mockAdmin({
      id: bookingId,
      payout_id: null,
      payout_status: "eligible",
      payout_paid_at: null,
    });
    const res = await assertBookingCleanerEarningsResetSafe(admin as never, bookingId);
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: "Booking payout is already eligible or paid; reset is not allowed.",
      code: "booking_payout_status_blocked",
    });
  });

  it("allows eligible payout_status when allowEligiblePayoutStatus is set", async () => {
    const admin = mockAdmin({
      id: bookingId,
      payout_id: null,
      payout_status: "eligible",
      payout_paid_at: null,
    });
    const res = await assertBookingCleanerEarningsResetSafe(admin as never, bookingId, {
      allowEligiblePayoutStatus: true,
    });
    expect(res).toEqual({ ok: true });
  });

  it("still blocks payout_paid_at even with allowEligiblePayoutStatus", async () => {
    const admin = mockAdmin({
      id: bookingId,
      payout_id: null,
      payout_status: "eligible",
      payout_paid_at: "2026-06-01T00:00:00.000Z",
    });
    const res = await assertBookingCleanerEarningsResetSafe(admin as never, bookingId, {
      allowEligiblePayoutStatus: true,
    });
    expect(res).toMatchObject({ ok: false, code: "booking_payout_paid_at_set" });
  });

  it("still blocks frozen weekly payout batch with allowEligiblePayoutStatus", async () => {
    const admin = mockAdmin(
      {
        id: bookingId,
        payout_id: "22222222-2222-4222-8222-222222222222",
        payout_status: "eligible",
        payout_paid_at: null,
      },
      { payoutBatch: { status: "frozen", frozen_at: "2026-06-01T00:00:00.000Z" } },
    );
    const res = await assertBookingCleanerEarningsResetSafe(admin as never, bookingId, {
      allowEligiblePayoutStatus: true,
    });
    expect(res).toMatchObject({ ok: false, code: "weekly_payout_locked" });
  });
});
