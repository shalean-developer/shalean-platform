import { beforeEach, describe, expect, it, vi } from "vitest";
import { performAdminAssignTeam } from "@/lib/admin/performAdminAssignTeam";
import { BOOKING_ROSTER_LOCKED_HINT, ROSTER_FINALIZED_CODE } from "@/lib/admin/bookingRosterLockedMessage";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/admin/adminBookingEarningsResetSafety", () => ({
  assertBookingCleanerEarningsResetSafe: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/payout/resetBookingCleanerLineEarnings", () => ({
  resetBookingCleanerLineEarnings: vi.fn(async () => ({ ok: true })),
}));

import { logSystemEvent } from "@/lib/logging/systemLog";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";

const bookingId = "11111111-1111-4111-8111-111111111111";
const newTeamId = "22222222-2222-4222-8222-222222222222";
const oldTeamId = "33333333-3333-4333-8333-333333333333";

function baseBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: bookingId,
    date: "2026-06-01",
    time: "09:00",
    service: "deep cleaning",
    booking_snapshot: { locked: { service: "deep" } },
    base_amount_cents: 90_000,
    service_fee_cents: 0,
    total_paid_cents: 90_000,
    amount_paid_cents: 90_000,
    team_id: null as string | null,
    is_team_job: false,
    status: "pending",
    payout_owner_cleaner_id: null as string | null,
    ...overrides,
  };
}

function baseTeam(overrides: Partial<{ lead_cleaner_id: string | null }> = {}) {
  return {
    id: newTeamId,
    name: "Alpha",
    service_type: "deep_cleaning",
    capacity_per_day: 5,
    is_active: true,
    lead_cleaner_id: twoMembers[0]!.cleaner_id,
    ...overrides,
  };
}

const twoMembers = [
  { cleaner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", active_from: "2020-01-01", active_to: null },
  { cleaner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", active_from: "2020-01-01", active_to: null },
];

function emptyMaybeSingleChain() {
  const root: Record<string, unknown> = {};
  const chain = () => root;
  root.select = chain;
  root.eq = chain;
  root.neq = chain;
  root.in = chain;
  root.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return root;
}

function countChain(count: number) {
  const p = Promise.resolve({ count, error: null });
  const root: Record<string, unknown> = {
    select: () => root,
    eq: () => root,
    neq: () => root,
    in: () => root,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return root;
}

function createMockAdmin(opts: {
  booking: ReturnType<typeof baseBooking>;
  team?: ReturnType<typeof baseTeam>;
  members?: Array<{ cleaner_id: string; active_from: string; active_to: string | null }>;
  slotCount?: number;
  slotUsageCount?: number;
  oldTeamCapacityRow?: { capacity_per_day: number };
  /** Count returned for booking_cleaners head count (roster lock empty check). */
  bookingCleanersCount?: number;
}) {
  const {
    booking,
    team = baseTeam(),
    members = twoMembers,
    slotCount = 0,
    slotUsageCount = 0,
    oldTeamCapacityRow,
    bookingCleanersCount = 0,
  } = opts;
  let bookingsFrom = 0;
  let teamsFrom = 0;

  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "release_team_capacity_slot" || name === "claim_team_capacity_slot") {
      return { data: true, error: null };
    }
    if (name === "assign_team_and_sync_roster") {
      (booking as Record<string, unknown>).team_id = newTeamId;
      (booking as Record<string, unknown>).is_team_job = true;
      (booking as Record<string, unknown>).payout_owner_cleaner_id = members[0]!.cleaner_id;
      bookingUpdates.push({ rpc: name, args: args ?? {} });
      return { data: { ok: true, variant: (args as { p_variant?: string })?.p_variant ?? "admin" }, error: null };
    }
    return { data: null, error: new Error(`unexpected rpc ${name}`) };
  });

  const payoutInserts: unknown[] = [];
  const payoutDeletes: unknown[] = [];
  const assignmentInserts: unknown[] = [];
  const assignmentDeletes: unknown[] = [];
  const bookingUpdates: unknown[] = [];

  const admin = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        bookingsFrom += 1;
        const withUpdate = (client: Record<string, unknown>) => ({
          ...client,
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        });
        if (bookingsFrom === 1) {
          return withUpdate({
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: booking, error: null }),
              }),
            }),
          });
        }
        if (bookingsFrom === 2) {
          return withUpdate(countChain(0) as Record<string, unknown>);
        }
        if (bookingsFrom === 3) {
          return withUpdate(countChain(slotCount) as Record<string, unknown>);
        }
        if (bookingsFrom === 4 || bookingsFrom === 5) {
          return withUpdate(emptyMaybeSingleChain() as Record<string, unknown>);
        }
        return withUpdate({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: booking, error: null }),
            }),
          }),
        });
      }
      if (table === "teams") {
        teamsFrom += 1;
        if (teamsFrom === 1) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: team, error: null }),
              }),
            }),
          };
        }
        if (teamsFrom === 2 && oldTeamCapacityRow) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: oldTeamCapacityRow, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected teams from() call #${teamsFrom}`);
      }
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: members, error: null }),
            }),
          }),
        };
      }
      if (table === "cleaners") {
        return {
          select: () => ({
            in: (_col: string, idList: string[]) =>
              Promise.resolve({
                data: idList.map((id) => ({
                  id,
                  can_do_deep_cleaning: true,
                  can_do_move_cleaning: true,
                })),
                error: null,
              }),
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { joined_at: "2025-01-01T00:00:00.000Z", created_at: "2025-01-01T00:00:00.000Z" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "booking_cleaners") {
        const sorted = [...members].sort((a, b) => a.cleaner_id.localeCompare(b.cleaner_id));
        const leadId = sorted[0]!.cleaner_id;
        const rosterData = sorted.map((m) => ({
          cleaner_id: m.cleaner_id,
          role: m.cleaner_id === leadId ? "lead" : "member",
          payout_weight: 1,
          lead_bonus_cents: 0,
        }));
        const countP = Promise.resolve({ count: bookingCleanersCount, error: null, data: null });
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: rosterData, error: null }),
              then: countP.then.bind(countP),
              catch: countP.catch.bind(countP),
              finally: countP.finally.bind(countP),
            }),
          }),
        };
      }
      if (table === "cleaner_earnings") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "team_job_member_payouts") {
        return {
          delete: () => ({
            eq: (_col: string, id: string) => {
              payoutDeletes.push(id);
              return Promise.resolve({ error: null });
            },
          }),
          insert: (rows: unknown) => {
            payoutInserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "booking_team_assignments") {
        return {
          delete: () => ({
            eq: (_col: string, id: string) => {
              assignmentDeletes.push(id);
              return Promise.resolve({ error: null });
            },
          }),
          insert: (row: unknown) => {
            assignmentInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "cleaner_earnings_adjustments") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "team_daily_capacity_usage") {
        return {
          select: () => ({
            eq: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.map((team_id) => ({ team_id, used_slots: slotUsageCount })),
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    }),
  };

  return { admin, rpc, payoutInserts, payoutDeletes, assignmentInserts, assignmentDeletes, bookingUpdates };
}

describe("performAdminAssignTeam", () => {
  beforeEach(() => {
    vi.mocked(logSystemEvent).mockClear();
    vi.mocked(assertBookingCleanerEarningsResetSafe).mockReset();
    vi.mocked(assertBookingCleanerEarningsResetSafe).mockResolvedValue({ ok: true });
    vi.mocked(resetBookingCleanerLineEarnings).mockReset();
    vi.mocked(resetBookingCleanerLineEarnings).mockResolvedValue({ ok: true });
  });

  it("assigns team successfully: updates booking, payouts per member, assignment row, logs override", async () => {
    const { admin, rpc, payoutInserts, bookingUpdates } = createMockAdmin({
      booking: baseBooking(),
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
      adminEmail: "admin@test.com",
    });
    expect(res).toEqual({ ok: true, teamId: newTeamId, oldTeamId: null });
    expect(rpc).toHaveBeenCalledWith(
      "claim_team_capacity_slot",
      expect.objectContaining({ p_team_id: newTeamId, p_booking_date: "2026-06-01" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("release_team_capacity_slot", expect.anything());
    expect(rpc).toHaveBeenCalledWith(
      "assign_team_and_sync_roster",
      expect.objectContaining({
        p_booking_id: bookingId,
        p_team_id: newTeamId,
        p_variant: "admin",
        p_source: "admin",
        p_team_member_count_snapshot: 2,
      }),
    );
    expect(bookingUpdates[0]).toMatchObject({
      rpc: "assign_team_and_sync_roster",
      args: expect.objectContaining({
        p_payout_owner_cleaner_id: twoMembers[0]!.cleaner_id,
      }),
    });
    const rows = payoutInserts[0] as Array<{ cleaner_id: string; payout_cents: number; team_id: string }>;
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((s, r) => s + r.payout_cents, 0);
    expect(sum).toBe(52_000);
    expect(rows.every((r) => r.team_id === newTeamId)).toBe(true);
    const byCleaner = new Map(rows.map((r) => [r.cleaner_id, r.payout_cents]));
    expect(byCleaner.get(twoMembers[0]!.cleaner_id)).toBe(27_000);
    expect(byCleaner.get(twoMembers[1]!.cleaner_id)).toBe(25_000);
    expect(vi.mocked(logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ADMIN_TEAM_OVERRIDE",
        context: expect.objectContaining({
          bookingId,
          oldTeamId: null,
          newTeamId,
          adminId: "admin-uuid",
        }),
      }),
    );
  });

  it("rejects admin assign when team has no appointed lead", async () => {
    const { admin } = createMockAdmin({
      booking: baseBooking(),
      team: baseTeam({ lead_cleaner_id: null }),
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(400);
      expect(res.error).toMatch(/appoint a team lead/i);
    }
  });

  it("reassign replaces old team: release + claim, oldTeamId in result and log", async () => {
    const { admin, rpc, payoutInserts } = createMockAdmin({
      booking: baseBooking({ team_id: oldTeamId, is_team_job: true }),
      oldTeamCapacityRow: { capacity_per_day: 4 },
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
    });
    expect(res).toEqual({ ok: true, teamId: newTeamId, oldTeamId });
    expect(rpc).toHaveBeenCalledWith(
      "release_team_capacity_slot",
      expect.objectContaining({ p_team_id: oldTeamId }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "claim_team_capacity_slot",
      expect.objectContaining({ p_team_id: newTeamId }),
    );
    const rows = payoutInserts[0] as Array<{ team_id: string }>;
    expect(rows.every((r) => r.team_id === newTeamId)).toBe(true);
    expect(vi.mocked(logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ oldTeamId, newTeamId }),
      }),
    );
  });

  it("rejects when team has no active members on booking date", async () => {
    const pastMembers = [
      { cleaner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", active_from: "2020-01-01", active_to: "2020-06-01" },
    ];
    const { admin } = createMockAdmin({
      booking: baseBooking(),
      members: pastMembers,
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "x",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(400);
      expect(res.error).toMatch(/at least 2 active members/i);
    }
  });

  it("rejects when team is at capacity for that date", async () => {
    const { admin } = createMockAdmin({
      booking: baseBooking(),
      slotCount: 5,
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "x",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(409);
    }
  });

  it("blocks assign when earnings finalized and roster empty without force", async () => {
    const { admin, rpc } = createMockAdmin({
      booking: baseBooking({ cleaner_line_earnings_finalized_at: "2026-06-01T12:00:00.000Z" }),
      bookingCleanersCount: 0,
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(409);
      expect(res.error).toBe(BOOKING_ROSTER_LOCKED_HINT);
      expect(res.code).toBe(ROSTER_FINALIZED_CODE);
    }
    expect(resetBookingCleanerLineEarnings).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("assign_team_and_sync_roster", expect.anything());
  });

  it("force assign reopens earnings then syncs roster when finalized", async () => {
    const { admin, rpc } = createMockAdmin({
      booking: baseBooking({ cleaner_line_earnings_finalized_at: "2026-06-01T12:00:00.000Z" }),
      bookingCleanersCount: 0,
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
      adminEmail: "admin@test.com",
      force: true,
    });
    expect(res).toEqual({
      ok: true,
      teamId: newTeamId,
      oldTeamId: null,
      forceReopenedEarnings: true,
    });
    expect(assertBookingCleanerEarningsResetSafe).toHaveBeenCalledWith(admin, bookingId);
    expect(resetBookingCleanerLineEarnings).toHaveBeenCalledWith(admin, bookingId);
    expect(rpc).toHaveBeenCalledWith(
      "assign_team_and_sync_roster",
      expect.objectContaining({
        p_booking_id: bookingId,
        p_team_id: newTeamId,
        p_variant: "admin",
      }),
    );
    expect(vi.mocked(logSystemEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ADMIN_TEAM_OVERRIDE",
        context: expect.objectContaining({
          force: true,
          forceReopenedEarnings: true,
        }),
      }),
    );
  });

  it("force assign fails when earnings reset is unsafe", async () => {
    vi.mocked(assertBookingCleanerEarningsResetSafe).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Weekly payout batch is frozen, approved, or paid; reset is not allowed.",
      code: "weekly_payout_locked",
    });
    const { admin, rpc } = createMockAdmin({
      booking: baseBooking({ cleaner_line_earnings_finalized_at: "2026-06-01T12:00:00.000Z" }),
      bookingCleanersCount: 0,
    });
    const res = await performAdminAssignTeam({
      admin: admin as never,
      bookingId,
      teamId: newTeamId,
      adminUserId: "admin-uuid",
      force: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.httpStatus).toBe(409);
      expect(res.code).toBe("weekly_payout_locked");
    }
    expect(resetBookingCleanerLineEarnings).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("assign_team_and_sync_roster", expect.anything());
  });
});
