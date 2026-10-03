import { beforeEach, describe, expect, it, vi } from "vitest";

const persistMock = vi.fn();
const resetMock = vi.fn();
const syncMock = vi.fn();
const logAdminMock = vi.fn();

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  persistCleanerPayoutIfUnset: (...args: unknown[]) => persistMock(...args),
}));

vi.mock("@/lib/payout/resetBookingCleanerLineEarnings", () => ({
  resetBookingCleanerLineEarnings: (...args: unknown[]) => resetMock(...args),
}));

vi.mock("@/lib/payout/syncPayoutBatchFromBookings", () => ({
  syncPayoutBatchFromBookings: (...args: unknown[]) => syncMock(...args),
}));

vi.mock("@/lib/admin/logAdminEarningsAction", () => ({
  logAdminEarningsAction: (...args: unknown[]) => logAdminMock(...args),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import { removeCleanerFromVisitPayout } from "@/lib/payout/removeCleanerFromVisitPayout";

const BOOKING_ID = "8a798b9e-4998-48bd-88c8-afd563e9686b";
const CLEANER_ID = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";

type Row = Record<string, unknown>;

function makeAdmin(
  bookingOverrides: Row = {},
  rosterRows: Row[] = [],
) {
  const bookingUpdates: Row[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  let bookingsCalls = 0;

  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      bookingsCalls += 1;
      if (bookingsCalls === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  status: "completed",
                  cleaner_id: null,
                  payout_owner_cleaner_id: null,
                  selected_cleaner_id: null,
                  payout_id: null,
                  payout_status: "pending",
                  payout_paid_at: null,
                  is_team_job: false,
                  display_earnings_cents: 0,
                  cleaner_payout_cents: null,
                  cleaner_earnings_total_cents: 0,
                  payout_frozen_cents: null,
                  earnings_summary: {
                    model_version: "v3",
                    per_cleaner_earnings: [
                      {
                        cleaner_id: CLEANER_ID,
                        role: "member",
                        base_earning_cents: 25000,
                        bonus_cents: 0,
                        deduction_cents: 0,
                        total_cents: 25000,
                      },
                    ],
                  },
                  ...bookingOverrides,
                },
                error: null,
              })),
            })),
          })),
        };
      }

      return {
        update: vi.fn((patch: Row) => {
          bookingUpdates.push(patch);
          return {
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: BOOKING_ID }], error: null })),
            })),
          };
        }),
      };
    }

    if (table === "booking_cleaners") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: rosterRows, error: null })),
        })),
      };
    }

    return {
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [], error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };
  });

  return { from, bookingUpdates, rpc };
}

describe("removeCleanerFromVisitPayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMock.mockResolvedValue({ ok: true });
    syncMock.mockResolvedValue({ ok: true, totalCents: 0 });
    logAdminMock.mockResolvedValue(undefined);
    persistMock.mockResolvedValue({ ok: true });
  });

  it("clears earnings_summary on solo unassign when only JSON attributes the cleaner", async () => {
    const admin = makeAdmin();

    const result = await removeCleanerFromVisitPayout(admin as never, {
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      adminUserId: "admin-user",
    });

    expect(result).toEqual({ ok: true, payoutId: null, batchTotalCents: null, mode: "unassigned" });
    expect(admin.bookingUpdates[0]).toMatchObject({
      display_earnings_cents: 0,
      cleaner_earnings_total_cents: 0,
      earnings_summary: null,
      payout_id: null,
    });
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("synchronizes team_member_count_snapshot after removing a roster payout member", async () => {
    const otherCleanerId = "53adb38b-5bb4-4ec7-85d6-ee8a6cbb31a7";
    const admin = makeAdmin(
      {
        is_team_job: true,
        cleaner_id: otherCleanerId,
        payout_owner_cleaner_id: otherCleanerId,
        display_earnings_cents: 25000,
        earnings_summary: {
          model_version: "v3",
          per_cleaner_earnings: [
            { cleaner_id: CLEANER_ID, role: "member", total_cents: 25000 },
            { cleaner_id: otherCleanerId, role: "lead", total_cents: 27000 },
          ],
        },
      },
      [
        { cleaner_id: CLEANER_ID, role: "member", payout_weight: 1, lead_bonus_cents: 0, source: "admin" },
        { cleaner_id: otherCleanerId, role: "lead", payout_weight: 1, lead_bonus_cents: 0, source: "admin" },
      ],
    );

    const result = await removeCleanerFromVisitPayout(admin as never, {
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      adminUserId: "admin-user",
    });

    expect(result).toEqual({ ok: true, payoutId: null, batchTotalCents: null, mode: "roster_removed" });
    expect(admin.rpc).toHaveBeenCalledWith("replace_booking_cleaners_admin_atomic", expect.objectContaining({
      p_booking_id: BOOKING_ID,
    }));
    expect(admin.bookingUpdates).toContainEqual({ team_member_count_snapshot: 1 });
  });

  it("preserves completed solo worker identity when clearing the last payout attribution", async () => {
    const admin = makeAdmin({
      cleaner_id: CLEANER_ID,
      payout_owner_cleaner_id: CLEANER_ID,
      selected_cleaner_id: CLEANER_ID,
      display_earnings_cents: 25000,
      cleaner_earnings_total_cents: 25000,
    });

    const result = await removeCleanerFromVisitPayout(admin as never, {
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      adminUserId: "admin-user",
    });

    expect(result).toEqual({ ok: true, payoutId: null, batchTotalCents: null, mode: "unassigned" });
    expect(admin.bookingUpdates[0]).toMatchObject({
      display_earnings_cents: 0,
      cleaner_earnings_total_cents: 0,
      earnings_summary: null,
      payout_id: null,
    });
    expect(admin.bookingUpdates[0]).not.toHaveProperty("cleaner_id");
    expect(admin.bookingUpdates[0]).not.toHaveProperty("payout_owner_cleaner_id");
    expect(admin.bookingUpdates[0]).not.toHaveProperty("selected_cleaner_id");
  });
});
