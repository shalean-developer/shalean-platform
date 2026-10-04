import { beforeEach, describe, expect, it, vi } from "vitest";

const persistCommand = vi.fn();
vi.mock("@/lib/payout/persistBookingEarningsSnapshotCommand", () => ({
  persistBookingEarningsSnapshotCommand: (...args: unknown[]) => persistCommand(...args),
}));

import { repairCompletedStuckZeroDisplayFromSignals } from "@/lib/payout/repairCompletedStuckZeroDisplayFromSignals";

function adminFor(rows: Record<string, unknown>[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    gt: vi.fn(),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  return { from: vi.fn(() => query) };
}

describe("repairCompletedStuckZeroDisplayFromSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistCommand.mockResolvedValue({ ok: true, skipped: false });
  });

  it("skips a paid zero-display row whose payout attribution was explicitly removed", async () => {
    const cleanerId = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";
    const admin = adminFor([{
      id: "booking-1",
      status: "completed",
      cleaner_id: cleanerId,
      payout_owner_cleaner_id: cleanerId,
      is_team_job: false,
      display_earnings_cents: 0,
      total_paid_cents: 50000,
      payment_status: "success",
      metadata: {
        payout_attribution_removal_v1: {
          active: true,
          cleaner_id: cleanerId,
          header_cleaner_id_at_removal: cleanerId,
          removed_at: "2026-10-03T18:00:00.000Z",
          removed_by_admin_id: "admin-1",
          reason: "wrong cleaner",
        },
      },
    }]);

    const result = await repairCompletedStuckZeroDisplayFromSignals(admin as never, 50);

    expect(result).toEqual({ ok: true, scanned: 1, matched_signals: 0, fixed: 0, skipped: 1, failed: 0 });
    expect(persistCommand).not.toHaveBeenCalled();
  });

  it("skips repair when removed attribution came from summary but the original header cleaner is unchanged", async () => {
    const admin = adminFor([{
      id: "booking-mismatch",
      status: "completed",
      cleaner_id: "header-cleaner",
      payout_owner_cleaner_id: "header-cleaner",
      is_team_job: false,
      display_earnings_cents: 0,
      total_paid_cents: 50000,
      payment_status: "success",
      metadata: {
        payout_attribution_removal_v1: {
          active: true,
          cleaner_id: "summary-cleaner",
          header_cleaner_id_at_removal: "header-cleaner",
          removed_at: "2026-10-03T18:00:00.000Z",
          removed_by_admin_id: "admin-1",
          reason: "wrong payout attribution",
        },
      },
    }]);

    const result = await repairCompletedStuckZeroDisplayFromSignals(admin as never, 50);

    expect(result).toEqual({ ok: true, scanned: 1, matched_signals: 0, fixed: 0, skipped: 1, failed: 0 });
    expect(persistCommand).not.toHaveBeenCalled();
  });

  it("allows repair after a different cleaner has been assigned", async () => {
    const admin = adminFor([{
      id: "booking-2",
      status: "completed",
      cleaner_id: "cleaner-new",
      payout_owner_cleaner_id: "cleaner-new",
      is_team_job: false,
      display_earnings_cents: 0,
      total_paid_cents: 50000,
      payment_status: "success",
      metadata: {
        payout_attribution_removal_v1: {
          active: true,
          cleaner_id: "cleaner-old",
          header_cleaner_id_at_removal: "cleaner-old",
          removed_at: "2026-10-03T18:00:00.000Z",
          removed_by_admin_id: "admin-1",
          reason: null,
        },
      },
    }]);

    const result = await repairCompletedStuckZeroDisplayFromSignals(admin as never, 50);

    expect(result).toEqual({ ok: true, scanned: 1, matched_signals: 1, fixed: 1, skipped: 0, failed: 0 });
    expect(persistCommand).toHaveBeenCalledTimes(1);
  });
});
