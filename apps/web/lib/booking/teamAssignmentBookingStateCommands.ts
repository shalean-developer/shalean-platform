import type { SupabaseClient } from "@supabase/supabase-js";
import { assignTeamAndSyncRoster } from "@/lib/booking/assignTeamAndSyncRoster";

type TeamAssignCommandResult =
  | { ok: true }
  | { ok: false; message: string; noRowUpdated?: boolean; reason?: string };

type TeamAssignCommandBaseParams = {
  admin: SupabaseClient;
  bookingId: string;
  teamId: string;
  payoutOwnerCleanerId: string;
  teamMemberCountSnapshot: number | null;
};

export async function assignDispatchTeamAndSyncRoster(
  params: TeamAssignCommandBaseParams & { assignedAtIso?: string | null },
): Promise<TeamAssignCommandResult> {
  return assignTeamAndSyncRoster(params.admin, {
    bookingId: params.bookingId,
    teamId: params.teamId,
    payoutOwnerCleanerId: params.payoutOwnerCleanerId,
    teamMemberCountSnapshot: params.teamMemberCountSnapshot,
    variant: "dispatch",
    source: "dispatch",
    assignedAtIso: params.assignedAtIso,
  });
}

export async function assignAdminTeamAndSyncRoster(
  params: TeamAssignCommandBaseParams,
): Promise<TeamAssignCommandResult> {
  return assignTeamAndSyncRoster(params.admin, {
    bookingId: params.bookingId,
    teamId: params.teamId,
    payoutOwnerCleanerId: params.payoutOwnerCleanerId,
    teamMemberCountSnapshot: params.teamMemberCountSnapshot,
    variant: "admin",
    source: "admin",
  });
}
