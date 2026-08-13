import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SupervisorTeamScope = {
  isSupervisor: boolean;
  teamIds: string[];
  cleanerIds: string[];
};

export async function resolveSupervisorTeamScope(
  admin: SupabaseClient,
  userId: string,
): Promise<SupervisorTeamScope> {
  const now = new Date().toISOString();
  const { data: roleRows, error: roleError } = await admin
    .from("admin_user_roles")
    .select("role_id, team_id, starts_at, expires_at, revoked_at, admin_roles!inner(code)")
    .eq("user_id", userId)
    .eq("admin_roles.code", "supervisor")
    .is("revoked_at", null);
  if (roleError) throw new Error(roleError.message);

  const activeRoles = (roleRows ?? []).filter((raw) => {
    const row = raw as { starts_at?: string | null; expires_at?: string | null };
    if (row.starts_at && row.starts_at > now) return false;
    if (row.expires_at && row.expires_at <= now) return false;
    return true;
  });
  if (!activeRoles.length) return { isSupervisor: false, teamIds: [], cleanerIds: [] };

  const explicitTeamIds = activeRoles
    .map((raw) => String((raw as { team_id?: string | null }).team_id ?? "").trim())
    .filter(Boolean);

  const { data: directCleaner, error: directCleanerError } = await admin
    .from("cleaners")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (directCleanerError) throw new Error(directCleanerError.message);

  let leadCleanerId = directCleaner ? String((directCleaner as { id: string }).id) : null;
  if (!leadCleanerId) {
    const { data: linkedCleaner, error: linkedCleanerError } = await admin
      .from("cleaner_auth_links")
      .select("cleaner_id")
      .eq("auth_user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (linkedCleanerError) throw new Error(linkedCleanerError.message);
    leadCleanerId = linkedCleaner ? String((linkedCleaner as { cleaner_id: string }).cleaner_id) : null;
  }

  let teamIds = [...new Set(explicitTeamIds)];
  if (leadCleanerId) {
    const { data: leadTeams, error: leadError } = await admin
      .from("teams")
      .select("id")
      .eq("lead_cleaner_id", leadCleanerId)
      .eq("is_active", true);
    if (leadError) throw new Error(leadError.message);
    teamIds = [...new Set([...teamIds, ...(leadTeams ?? []).map((t) => String((t as { id: string }).id))])];
  }

  if (!teamIds.length) return { isSupervisor: true, teamIds: [], cleanerIds: [] };

  const { data: members, error: memberError } = await admin
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .in("team_id", teamIds)
    .is("active_to", null);
  if (memberError) throw new Error(memberError.message);

  const cleanerIds = new Set<string>();
  for (const raw of members ?? []) {
    const row = raw as { cleaner_id?: string | null; active_from?: string | null };
    if (row.active_from && row.active_from > now) continue;
    const cleanerId = String(row.cleaner_id ?? "").trim();
    if (cleanerId) cleanerIds.add(cleanerId);
  }
  if (leadCleanerId) cleanerIds.add(leadCleanerId);

  return { isSupervisor: true, teamIds, cleanerIds: [...cleanerIds] };
}

export async function bookingBelongsToSupervisorScope(
  admin: SupabaseClient,
  bookingId: string,
  scope: SupervisorTeamScope,
): Promise<boolean> {
  if (!scope.isSupervisor || !scope.teamIds.length) return false;

  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, team_id, assigned_team_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return false;

  const row = booking as { team_id?: string | null; assigned_team_id?: string | null };
  const teamId = String(row.team_id ?? row.assigned_team_id ?? "").trim();
  if (teamId && scope.teamIds.includes(teamId)) return true;

  const { data: roster, error: rosterError } = await admin
    .from("booking_cleaners")
    .select("cleaner_id")
    .eq("booking_id", bookingId);
  if (rosterError) throw new Error(rosterError.message);
  return (roster ?? []).some((r) => scope.cleanerIds.includes(String((r as { cleaner_id: string }).cleaner_id)));
}
