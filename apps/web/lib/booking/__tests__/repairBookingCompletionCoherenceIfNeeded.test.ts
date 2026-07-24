import { describe, expect, it, vi } from "vitest";

import { repairBookingCompletionCoherenceIfNeeded } from "@/lib/booking/repairBookingCompletionCoherenceIfNeeded";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

vi.mock("@/lib/payout/ensureCleanerEarningsLedger", () => ({
  ensureCleanerEarningsLedgerRow: vi.fn().mockResolvedValue({ ok: true }),
}));

type UpdateCall = { table: string; patch: Record<string, unknown>; id: string };

function makeAdmin(opts: { updateError?: { message: string } | null } = {}) {
  const updates: UpdateCall[] = [];
  const admin = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              updates.push({ table, patch, id });
              return Promise.resolve({ error: opts.updateError ?? null });
            },
          };
        },
      };
    },
  };
  return { admin: admin as never, updates };
}

describe("repairBookingCompletionCoherenceIfNeeded", () => {
  it("heals assigned + completed_at drift to status=completed (regression: early-return bug)", async () => {
    const { admin, updates } = makeAdmin();
    const result = await repairBookingCompletionCoherenceIfNeeded({
      admin,
      bookingId: "6b580f19-0305-4602-8ce2-ac0dad4c9ac1",
      row: {
        status: "assigned",
        completed_at: "2026-07-02T16:00:00.000Z",
        dispatch_status: "assigned",
      },
      ensureLedger: true,
    });

    expect(result.repaired).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe("bookings");
    expect(updates[0]?.patch.status).toBe("completed");
    expect(updates[0]?.patch.cleaner_response_status).toBe(CLEANER_RESPONSE.COMPLETED);
  });

  it("does not rewrite when status is already completed", async () => {
    const { admin, updates } = makeAdmin();
    const result = await repairBookingCompletionCoherenceIfNeeded({
      admin,
      bookingId: "booking-1",
      row: {
        status: "completed",
        completed_at: "2026-07-02T16:00:00.000Z",
      },
      ensureLedger: true,
    });

    expect(result.repaired).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
