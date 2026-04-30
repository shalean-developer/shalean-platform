import { beforeEach, describe, expect, it, vi } from "vitest";
import { performAdminAssignTeam } from "@/lib/admin/performAdminAssignTeam";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import { logSystemEvent } from "@/lib/logging/systemLog";

const bookingId = "11111111-1111-4111-8111-111111111111";
const newTeamId = "22222222-2222-4222-8222-222222222222";
const oldTeamId = "33333333-3333-4333-8333-333333333333";

function baseBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: bookingId,
    date: "2026-06-01",
    service: "deep cleaning",
    team_id: null as string | null,
    is_team_job: false,
    status: "pending",
    ...overrides,
  };
}

function baseTeam() {
  return {
    id: newTeamId,
    name: "Alpha",
    service_type: "deep_cleaning",
    capacity_per_day: 5,
    is_active: true,
  };
}

const twoMembers = [
  { cleaner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", active_from: "2020-01-01", active_to: null },
  { cleaner_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", active_from: "2020-01-01", active_to: null },
];

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
  oldTeamCapacityRow?: { capacity_per_day: number };
}) {
  const { booking, team = baseTeam(), members = twoMembers, slotCount = 0, oldTeamCapacityRow } = opts;
  let bookingsFrom = 0;
  let teamsFrom = 0;

  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "release_team_capacity_slot" || name === "claim_team_capacity_slot") {
      return { data: true, error: null };
    }
    if (name === "assign_team_and_sync_roster") {
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
        if (bookingsFrom === 1) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: booking, error: null }),
              }),
            }),
          };
        }
        if (bookingsFrom === 2) {
          return countChain(slotCount);
        }
        if (bookingsFrom === 3) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      cleaner_earnings_total_cents: 60_000,
                      display_earnings_cents: null,
                      cleaner_payout_cents: null,
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        throw new Error(`unexpected bookings from() call #${bookingsFrom}`);
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
      if (table === "booking_cleaners") {
        const sorted = [...members].sort((a, b) => a.cleaner_id.localeCompare(b.cleaner_id));
        const leadId = sorted[0]!.cleaner_id;
        const rosterData = sorted.map((m) => ({
          cleaner_id: m.cleaner_id,
          role: m.cleaner_id === leadId ? "lead" : "member",
          payout_weight: 1,
          lead_bonus_cents: 0,
        }));
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: rosterData, error: null }),
            }),
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
      throw new Error("unexpected table " + table);
    }),
  };

  return { admin, rpc, payoutInserts, payoutDeletes, assignmentInserts, assignmentDeletes, bookingUpdates };
}

describe("performAdminAssignTeam", () => {
  beforeEach(() => {
    vi.mocked(logSystemEvent).mockClear();
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
    expect(sum).toBe(60_000);
    expect(rows.every((r) => r.team_id === newTeamId)).toBe(true);
    expect(rows.every((r) => r.payout_cents === 30_000)).toBe(true);
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
      expect(res.error).toMatch(/no active members/i);
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
});
