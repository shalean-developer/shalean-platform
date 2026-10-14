import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { describe, expect, it, vi } from "vitest";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { assertAdminBookingEditDetailsAllowed } from "@/lib/booking/assertAdminBookingEditDetailsAllowed";
import { removeCleanerFromVisitPayout } from "@/lib/payout/removeCleanerFromVisitPayout";
import { recalculateCleanerEarningsBatch } from "@/lib/payout/recalculateCleanerEarningsBatch";
import { propagateRecurringPlanToGeneratedBookings } from "@/lib/recurring/propagateRecurringPlanToGeneratedBookings";
const BID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  CID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
function readOnlyBooking(date: string | null) {
  const writes = vi.fn(() => {
    throw new Error("Unexpected mutation before historical preflight");
  });
  const row = {
    id: BID,
    date,
    status: "completed",
    cleaner_id: CID,
    payout_id: null,
    payout_status: "pending",
    payout_paid_at: null,
    display_earnings_cents: 0,
    cleaner_earnings_total_cents: 0,
    cleaner_line_earnings_finalized_at: null,
  };
  const q = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    not: () => q,
    maybeSingle: async () => ({ data: row, error: null }),
    then: (resolve: (r: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve),
    update: writes,
    delete: writes,
    insert: writes,
  };
  const admin = {
    from: vi.fn((table: string) => {
      expect(table).toBe("bookings");
      return q;
    }),
    rpc: writes,
  };
  return { admin, writes, row };
}
describe("historical cleanup rejects before any mutation", () => {
  it("skips historical persistence before any roster or payout cleanup", async () => {
    const { admin, writes } = readOnlyBooking("2026-09-30");
    expect(await persistCleanerPayoutIfUnset({ admin: admin as never, bookingId: BID, cleanerId: CID, forceDisplayRecompute: true })).toMatchObject({ ok: true, skipped: true, skipReason: "historical_payout_item_deferred" });
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["2026-09-30", null])(
    "blocks reset safety and direct reset for %s even with zero totals",
    async (date) => {
      const { admin, writes } = readOnlyBooking(date);
      expect(
        await assertBookingCleanerEarningsResetSafe(admin as never, BID, {
          allowEligiblePayoutStatus: true,
        }),
      ).toMatchObject({
        ok: false,
        status: 409,
        code: "historical_payout_item_deferred",
      });
      expect(
        await resetBookingCleanerLineEarnings(admin as never, BID),
      ).toMatchObject({ ok: false });
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("blocks the edit-details/repricing gate before pending ledger or line-item access", async () => {
    const { admin, writes } = readOnlyBooking("2026-09-30");
    expect(
      await assertAdminBookingEditDetailsAllowed(admin as never, BID),
    ).toMatchObject({ ok: false, status: 409 });
    expect(writes).not.toHaveBeenCalled();
  });
  it("blocks attribution removal before roster, batch or earnings writes", async () => {
    const { admin, writes } = readOnlyBooking("2026-09-30");
    expect(
      await removeCleanerFromVisitPayout(admin as never, {
        bookingId: BID,
        cleanerId: CID,
        adminUserId: "owner",
      }),
    ).toMatchObject({ ok: false, code: "historical_payout_item_deferred" });
    expect(writes).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "skips historical batch recalculation even when skipReset=%s",
    async (skipReset) => {
      const { admin, writes } = readOnlyBooking("2026-09-30");
      expect(
        await recalculateCleanerEarningsBatch({
          admin: admin as never,
          bookingId: BID,
          skipReset,
        }),
      ).toMatchObject({
        attempted: 0,
        recomputed: 0,
        skipped: 1,
        skipReasons: { historical_payout_item_deferred: 1 },
      });
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("skips recurring repricing before changing booking details or line earnings", async () => {
    const { admin, writes } = readOnlyBooking("2026-09-30");
    expect(
      await propagateRecurringPlanToGeneratedBookings(
        admin as never,
        { id: "plan" } as never,
      ),
    ).toMatchObject({
      bookings_updated: 0,
      earnings_recomputed: 0,
      earnings_skipped: 1,
    });
    expect(writes).not.toHaveBeenCalled();
  });
});
