import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignTeamAndSyncVariant = "admin" | "dispatch";

type AssignTeamRpcPayload = {
  ok?: boolean;
  reason?: string;
  variant?: string;
};

/**
 * Single DB transaction: set team fields on `bookings` and rebuild `booking_cleaners`.
 * Dispatch variant: DB returns `{ ok: false, reason: "race_lost" }` when the row did not match pending + null cleaner.
 */
export async function assignTeamAndSyncRoster(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    teamId: string;
    payoutOwnerCleanerId: string;
    teamMemberCountSnapshot: number | null;
    variant: AssignTeamAndSyncVariant;
    source: string;
    assignedAtIso?: string | null;
  },
): Promise<
  { ok: true } | { ok: false; message: string; noRowUpdated?: boolean; reason?: string }
> {
  const {
    bookingId,
    teamId,
    payoutOwnerCleanerId,
    teamMemberCountSnapshot,
    variant,
    source,
    assignedAtIso = null,
  } = params;

  const { data, error } = await admin.rpc("assign_team_and_sync_roster", {
    p_booking_id: bookingId,
    p_team_id: teamId,
    p_payout_owner_cleaner_id: payoutOwnerCleanerId,
    p_team_member_count_snapshot: teamMemberCountSnapshot,
    p_variant: variant,
    p_source: source,
    p_assigned_at: assignedAtIso,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  // Pre-migration RPC returned boolean `false` for dispatch race.
  if (variant === "dispatch" && data === false) {
    return { ok: false, message: "booking_update_no_matching_row", noRowUpdated: true, reason: "race_lost" };
  }

  const payload = data as AssignTeamRpcPayload | null | undefined;
  if (payload && typeof payload === "object" && payload.ok === false) {
    const reason = String(payload.reason ?? "").trim() || "unknown";
    return {
      ok: false,
      message: reason === "race_lost" ? "booking_update_no_matching_row" : reason,
      noRowUpdated: reason === "race_lost",
      reason,
    };
  }

  return { ok: true };
}
