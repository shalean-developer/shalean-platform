import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  assignAdminTeamAndSyncRoster,
  assignDispatchTeamAndSyncRoster,
} from "@/lib/booking/teamAssignmentBookingStateCommands";

const bookingDir = path.resolve(__dirname, "..");
const repoLibDir = path.resolve(bookingDir, "..");
const command = path.join(bookingDir, "teamAssignmentBookingStateCommands.ts");
const rpcWrapper = path.join(bookingDir, "assignTeamAndSyncRoster.ts");
const dispatchAssignTeam = path.join(repoLibDir, "dispatch", "assignTeamToBooking.ts");
const adminAssignTeam = path.join(repoLibDir, "admin", "performAdminAssignTeam.ts");

const bookingId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const payoutOwnerCleanerId = "33333333-3333-4333-8333-333333333333";
const assignedAtIso = "2026-06-01T08:30:00.000Z";

function mockAdmin() {
  return {
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

describe("team assignment booking-state command convergence (Phase 1I)", () => {
  it("keeps assign_team_and_sync_roster behind the existing RPC wrapper", () => {
    const commandSrc = readFileSync(command, "utf8");
    const wrapperSrc = readFileSync(rpcWrapper, "utf8");

    expect(commandSrc).toContain("assignTeamAndSyncRoster");
    expect(commandSrc).not.toContain('rpc("assign_team_and_sync_roster"');
    expect(wrapperSrc).toContain('rpc("assign_team_and_sync_roster"');
  });

  it("migrates dispatch and admin team assignment call sites to the Phase 1I command boundary", () => {
    const dispatchSrc = readFileSync(dispatchAssignTeam, "utf8");
    const adminSrc = readFileSync(adminAssignTeam, "utf8");

    expect(dispatchSrc).toContain("teamAssignmentBookingStateCommands");
    expect(dispatchSrc).toContain("assignDispatchTeamAndSyncRoster");
    expect(dispatchSrc).not.toContain("assignTeamAndSyncRoster");

    expect(adminSrc).toContain("teamAssignmentBookingStateCommands");
    expect(adminSrc).toContain("assignAdminTeamAndSyncRoster");
    expect(adminSrc).not.toContain("assignTeamAndSyncRoster");
  });

  it("pins dispatch RPC args exactly", async () => {
    const admin = mockAdmin();

    await assignDispatchTeamAndSyncRoster({
      admin,
      bookingId,
      teamId,
      payoutOwnerCleanerId,
      teamMemberCountSnapshot: 3,
      assignedAtIso,
    });

    expect(admin.rpc).toHaveBeenCalledWith("assign_team_and_sync_roster", {
      p_booking_id: bookingId,
      p_team_id: teamId,
      p_payout_owner_cleaner_id: payoutOwnerCleanerId,
      p_team_member_count_snapshot: 3,
      p_variant: "dispatch",
      p_source: "dispatch",
      p_assigned_at: assignedAtIso,
    });
  });

  it("pins admin RPC args exactly", async () => {
    const admin = mockAdmin();

    await assignAdminTeamAndSyncRoster({
      admin,
      bookingId,
      teamId,
      payoutOwnerCleanerId,
      teamMemberCountSnapshot: 2,
    });

    expect(admin.rpc).toHaveBeenCalledWith("assign_team_and_sync_roster", {
      p_booking_id: bookingId,
      p_team_id: teamId,
      p_payout_owner_cleaner_id: payoutOwnerCleanerId,
      p_team_member_count_snapshot: 2,
      p_variant: "admin",
      p_source: "admin",
      p_assigned_at: null,
    });
  });
});
