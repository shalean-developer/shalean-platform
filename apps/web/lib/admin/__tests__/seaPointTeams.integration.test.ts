/**
 * @vitest-environment node
 *
 * Deterministic Sea Point team assignability fixture — does not load .env.local
 * and does not query live / production databases.
 */
import { describe, expect, it } from "vitest";
import { listTeamAssignCandidatesForBooking } from "@/lib/admin/performAdminAssignTeam";
import type { SupabaseClient } from "@supabase/supabase-js";

const SEA_POINT_A = "35e4ca42-d5cd-4323-a80a-87c074a6871a";
const SEA_POINT_H = "3ac0e903-2fa2-4572-83f6-297105d9facc";
const CLEANER_1 = "11111111-1111-4111-8111-111111111111";
const CLEANER_2 = "22222222-2222-4222-8222-222222222222";
const CLEANER_3 = "33333333-3333-4333-8333-333333333333";
const CLEANER_4 = "44444444-4444-4444-8444-444444444444";

/** Synthetic fixture IDs — not real customer data. */
const seaPointIds = new Set([SEA_POINT_A, SEA_POINT_H]);

type QueryResult = { data: unknown; error: null | { message: string }; count?: number | null };

/**
 * Minimal thenable query builder that also supports count/head selects used by
 * team capacity helpers.
 */
function createQuery(result: QueryResult) {
  const self: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const method of [
    "select",
    "eq",
    "neq",
    "in",
    "not",
    "order",
    "limit",
    "gte",
    "lte",
    "is",
  ]) {
    self[method] = () => self;
  }
  self.then = (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
    terminal().then(resolve, reject);
  return self;
}

function createSeaPointFixtureAdmin(): SupabaseClient {
  const teams = [
    {
      id: SEA_POINT_A,
      name: "Team Sea Point A",
      service_type: "deep",
      capacity_per_day: 2,
      is_active: true,
    },
    {
      id: SEA_POINT_H,
      name: "Team Sea Point H",
      service_type: "move",
      capacity_per_day: 2,
      is_active: true,
    },
  ];
  const members = [
    { team_id: SEA_POINT_A, cleaner_id: CLEANER_1, active_from: "2026-01-01", active_to: null },
    { team_id: SEA_POINT_A, cleaner_id: CLEANER_2, active_from: "2026-01-01", active_to: null },
    { team_id: SEA_POINT_H, cleaner_id: CLEANER_3, active_from: "2026-01-01", active_to: null },
    { team_id: SEA_POINT_H, cleaner_id: CLEANER_4, active_from: "2026-01-01", active_to: null },
  ];
  const cleaners = [
    { id: CLEANER_1, can_do_deep_cleaning: true, can_do_move_cleaning: true },
    { id: CLEANER_2, can_do_deep_cleaning: true, can_do_move_cleaning: true },
    { id: CLEANER_3, can_do_deep_cleaning: true, can_do_move_cleaning: true },
    { id: CLEANER_4, can_do_deep_cleaning: true, can_do_move_cleaning: true },
  ];

  return {
    from(table: string) {
      if (table === "teams") {
        return createQuery({ data: teams, error: null });
      }
      if (table === "team_members") {
        return createQuery({ data: members, error: null });
      }
      if (table === "cleaners") {
        return createQuery({ data: cleaners, error: null });
      }
      if (table === "bookings") {
        // Platform capacity + per-team slot usage reads.
        return createQuery({ data: [], error: null, count: 0 });
      }
      if (table === "team_daily_capacity_usage") {
        return createQuery({ data: [], error: null });
      }
      throw new Error(`unexpected table in Sea Point fixture: ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("Sea Point teams (deterministic fixture)", () => {
  const admin = createSeaPointFixtureAdmin();

  it("lists Sea Point teams as assignable for a future deep booking", async () => {
    const booking = {
      id: "00000000-0000-4000-8000-000000000099",
      date: "2026-12-15",
      service: "Deep Cleaning",
      service_slug: "deep",
      booking_snapshot: null,
      is_team_job: false,
    };
    const r = await listTeamAssignCandidatesForBooking(admin, booking);
    expect(r.error).toBeNull();
    const sea = r.teams.filter((t) => seaPointIds.has(t.id));
    expect(sea.length).toBe(2);
    for (const t of sea) {
      expect(t.assignable, `${t.name} assignable flags`).toBe(true);
    }
  });

  it("lists Sea Point teams as assignable for a future move booking", async () => {
    const booking = {
      id: "00000000-0000-4000-8000-000000000099",
      date: "2026-12-15",
      service: "Move In/Out Cleaning",
      service_slug: "move",
      booking_snapshot: null,
      is_team_job: false,
    };
    const r = await listTeamAssignCandidatesForBooking(admin, booking);
    expect(r.error).toBeNull();
    const sea = r.teams.filter((t) => seaPointIds.has(t.id));
    expect(sea.length).toBe(2);
    expect(sea.every((t) => t.assignable)).toBe(true);
  });

  it("exposes Team Sea Point H as an assignable candidate without mutating bookings", async () => {
    const booking = {
      id: "00000000-0000-4000-8000-000000000088",
      date: "2026-12-15",
      service: "Move In/Out Cleaning",
      service_slug: "move",
      booking_snapshot: null,
      is_team_job: false,
    };
    const r = await listTeamAssignCandidatesForBooking(admin, booking);
    expect(r.error).toBeNull();
    const teamH = r.teams.find((t) => t.id === SEA_POINT_H);
    expect(teamH).toBeDefined();
    expect(teamH!.name).toBe("Team Sea Point H");
    expect(teamH!.assignable).toBe(true);
    expect(teamH!.remaining_slots_today).toBeGreaterThan(0);
    // Fixture admin throws on unexpected writes; candidate listing must remain read-only.
  });
});
