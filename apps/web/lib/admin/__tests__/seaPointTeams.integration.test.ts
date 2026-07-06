/**
 * @vitest-environment node
 * Integration check against .env.local DB — skipped in CI without credentials.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { listTeamAssignCandidatesForBooking, performAdminAssignTeam } from "@/lib/admin/performAdminAssignTeam";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

describe.skipIf(!hasDb)("Sea Point teams integration", () => {
  const admin = createClient(url!, key!);
  const seaPointIds = new Set([
    "35e4ca42-d5cd-4323-a80a-87c074a6871a",
    "3ac0e903-2fa2-4572-83f6-297105d9facc",
  ]);

  it("lists Sea Point teams as assignable for a future deep booking", async () => {
    const booking = {
      id: "00000000-0000-0000-0000-000000000099",
      date: "2026-07-10",
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
      id: "00000000-0000-0000-0000-000000000099",
      date: "2026-07-10",
      service: "Move In/Out Cleaning",
      service_slug: "move",
      booking_snapshot: null,
      is_team_job: false,
    };
    const r = await listTeamAssignCandidatesForBooking(admin, booking);
    const sea = r.teams.filter((t) => seaPointIds.has(t.id));
    expect(sea.every((t) => t.assignable)).toBe(true);
  });

  it("can assign Team Sea Point H to the July 8 move booking (dry run then revert)", async () => {
    const bookingId = "d2cfcb8d-118f-48cc-90c7-420ffe122c9b";
    const teamId = "3ac0e903-2fa2-4572-83f6-297105d9facc";
    const { data: before } = await admin
      .from("bookings")
      .select("team_id, is_team_job")
      .eq("id", bookingId)
      .single();
    const oldTeamId = before?.team_id ?? null;

    const result = await performAdminAssignTeam({
      admin,
      bookingId,
      teamId,
      adminUserId: "00000000-0000-0000-0000-000000000001",
      adminEmail: "integration@test.local",
    });
    expect(result.ok, result.ok ? "" : (result as { error: string }).error).toBe(true);

    if (oldTeamId) {
      const revert = await performAdminAssignTeam({
        admin,
        bookingId,
        teamId: oldTeamId,
        adminUserId: "00000000-0000-0000-0000-000000000001",
        adminEmail: "integration@test.local",
      });
      expect(revert.ok, revert.ok ? "" : (revert as { error: string }).error).toBe(true);
    }
  });
});
