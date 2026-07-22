import { beforeEach, describe, expect, it, vi } from "vitest";

const rawMock = vi.fn();
const auditMock = vi.fn();
const syncOpenMock = vi.fn();
const logAdminMock = vi.fn();

vi.mock("@/lib/payout/assertVisitEarningsReadAfterWrite", () => ({
  assertVisitEarningsReadAfterWrite: (...args: unknown[]) => rawMock(...args),
}));

vi.mock("@/lib/payout/requireVisitEarningsAdjustAudit", () => ({
  requireVisitEarningsAdjustAudit: (...args: unknown[]) => auditMock(...args),
}));

vi.mock("@/lib/payout/syncPayoutBatchFromBookings", () => ({
  syncPayoutBatchFromBookings: vi.fn(),
  syncOpenPayoutBatchesForVisitEdit: (...args: unknown[]) => syncOpenMock(...args),
}));

vi.mock("@/lib/admin/logAdminEarningsAction", () => ({
  logAdminEarningsAction: (...args: unknown[]) => logAdminMock(...args),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import { adjustBookingTeamMemberPayoutEarnings } from "@/lib/payout/adjustBookingTeamMemberPayoutEarnings";

const BOOKING_ID = "8a798b9e-4998-48bd-88c8-afd563e9686b";
const LEAD = "015e91e8-df25-4fde-8db1-a5901b005ae3";
const MEMBER = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";
const ADMIN = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

function makeAdmin(opts?: { withSummaryMember?: boolean }) {
  const bookingUpdates: Row[] = [];
  const tjUpdates: Row[] = [];
  let bookingsSelects = 0;

  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      return {
        select: vi.fn(() => {
          bookingsSelects += 1;
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  date: "2026-07-15",
                  status: "completed",
                  team_id: null,
                  cleaner_id: LEAD,
                  payout_owner_cleaner_id: LEAD,
                  payout_id: null,
                  payout_status: "eligible",
                  payout_paid_at: null,
                  is_team_job: false,
                  billing_type: "prepaid",
                  total_paid_cents: 80000,
                  amount_paid_cents: 80000,
                  total_paid_zar: 800,
                  cleaner_payout_cents: 27000,
                  cleaner_bonus_cents: 0,
                  display_earnings_cents: 27000,
                  cleaner_earnings_total_cents: 27000,
                  payout_frozen_cents: 27000,
                  earnings_summary: {
                    model_version: "v3",
                    customer_total_cents: 80000,
                    costs_cents: 0,
                    per_cleaner_earnings: [
                      {
                        cleaner_id: LEAD,
                        role: "lead",
                        base_earning_cents: 27000,
                        bonus_cents: 0,
                        deduction_cents: 0,
                        total_cents: 27000,
                      },
                      ...(opts?.withSummaryMember
                        ? [
                            {
                              cleaner_id: MEMBER,
                              role: "member",
                              base_earning_cents: 25000,
                              bonus_cents: 0,
                              deduction_cents: 0,
                              total_cents: 25000,
                            },
                          ]
                        : []),
                    ],
                  },
                },
                error: null,
              })),
            })),
          };
        }),
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
          eq: vi.fn(async () => ({
            data: [
              { cleaner_id: LEAD, role: "lead" },
              { cleaner_id: MEMBER, role: "member" },
            ],
            error: null,
          })),
        })),
      };
    }

    if (table === "team_job_member_payouts") {
      return {
        select: vi.fn((cols: string) => {
          if (cols.includes("cleaner_id") && cols.includes("payout_cents") && !cols.includes("status")) {
            return {
              eq: vi.fn(async () => ({
                data: [
                  { cleaner_id: MEMBER, payout_cents: 25000 },
                ],
                error: null,
              })),
            };
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { status: "pending", payout_cents: 25000 },
                  error: null,
                })),
              })),
            })),
          };
        }),
        update: vi.fn((patch: Row) => {
          tjUpdates.push(patch);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }),
      };
    }

    if (table === "booking_roster_member_payouts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          in: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    };
  });

  return { from, bookingUpdates, tjUpdates, bookingsSelects };
}

describe("adjustBookingTeamMemberPayoutEarnings pseudo-team TJ member", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rawMock.mockResolvedValue({ ok: true, effectiveCents: 30000 });
    auditMock.mockResolvedValue({ ok: true });
    syncOpenMock.mockResolvedValue({ ok: true, batchTotalCents: null, syncedPayoutIds: [] });
    logAdminMock.mockResolvedValue(undefined);
  });

  it("updates TJ + summary for member without overwriting lead hybrid columns", async () => {
    const admin = makeAdmin();
    const result = await adjustBookingTeamMemberPayoutEarnings(admin as never, {
      bookingId: BOOKING_ID,
      cleanerId: MEMBER,
      payoutCents: 30000,
      bonusCents: 0,
      adminUserId: ADMIN,
    });

    expect(result.ok).toBe(true);
    expect(admin.tjUpdates[0]).toEqual({ payout_cents: 30000 });
    expect(admin.bookingUpdates[0]).toBeTruthy();
    expect(admin.bookingUpdates[0].cleaner_payout_cents).toBeUndefined();
    expect(admin.bookingUpdates[0].display_earnings_cents).toBeUndefined();
    const summary = admin.bookingUpdates[0].earnings_summary as {
      per_cleaner_earnings: Array<{ cleaner_id: string; total_cents: number }>;
    };
    expect(summary.per_cleaner_earnings.find((r) => r.cleaner_id === MEMBER)?.total_cents).toBe(30000);
    expect(rawMock).toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalled();
  });
});
