import { beforeEach, describe, expect, it, vi } from "vitest";
import { reassignPayoutOwnerBeforeTeamMemberRemove } from "@/lib/admin/reassignPayoutOwnerBeforeTeamMemberRemove";

const teamId = "22222222-2222-4222-8222-222222222222";
const removingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const replacementId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createAdmin(opts: {
  leadCleanerId?: string | null;
  remainingMembers?: Array<{ cleaner_id: string; active_from: string; active_to: string | null }>;
  openBookings?: Array<{ id: string; date: string }>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let bookingsCalls = 0;
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "teams") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { lead_cleaner_id: opts.leadCleanerId ?? removingId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              neq: async () => ({
                data: opts.remainingMembers ?? [
                  { cleaner_id: replacementId, active_from: "2020-01-01", active_to: null },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        bookingsCalls += 1;
        if (bookingsCalls === 1) {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: async () => ({
                      data: opts.openBookings ?? [{ id: "booking-1", date: "2026-07-13" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: string) => ({
              eq: async (col2: string, val2: string) => {
                if (col === "id" && col2 === "payout_owner_cleaner_id") {
                  updates.push({ id: val, patch });
                }
                return { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { admin, updates };
}

describe("reassignPayoutOwnerBeforeTeamMemberRemove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with zero when no open bookings reference the cleaner", async () => {
    const { admin } = createAdmin({ openBookings: [] });
    const result = await reassignPayoutOwnerBeforeTeamMemberRemove(admin as never, {
      teamId,
      cleanerId: removingId,
    });
    expect(result).toEqual({ ok: true, reassigned: 0 });
  });

  it("reassigns open bookings to another active roster member", async () => {
    const { admin, updates } = createAdmin({
      leadCleanerId: removingId,
      openBookings: [{ id: "booking-1", date: "2026-07-13" }],
    });
    const result = await reassignPayoutOwnerBeforeTeamMemberRemove(admin as never, {
      teamId,
      cleanerId: removingId,
    });
    expect(result).toEqual({ ok: true, reassigned: 1 });
    expect(updates[0]).toEqual({
      id: "booking-1",
      patch: { payout_owner_cleaner_id: replacementId, cleaner_id: replacementId },
    });
  });

  it("blocks removal of the last member when open bookings still need a payout owner", async () => {
    const { admin } = createAdmin({
      remainingMembers: [],
      openBookings: [{ id: "booking-1", date: "2026-07-13" }],
    });
    const result = await reassignPayoutOwnerBeforeTeamMemberRemove(admin as never, {
      teamId,
      cleanerId: removingId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(409);
      expect(result.error).toMatch(/last team member/i);
    }
  });
});
