import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";

const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "in_progress"] as const;

export type AssignmentSlotConflictRow = {
  id: string;
  customer_name: string | null;
  time: string | null;
};

export async function findTeamJobSlotConflict(
  admin: SupabaseClient,
  params: { teamId: string; dateYmd: string; timeHm: string; excludeBookingId: string },
): Promise<AssignmentSlotConflictRow | null> {
  const teamId = params.teamId.trim();
  const dateYmd = params.dateYmd.trim();
  const timeHm = normalizeTimeHm(params.timeHm);
  if (!teamId || !dateYmd || !timeHm) return null;

  const { data, error } = await admin
    .from("bookings")
    .select("id, customer_name, time")
    .eq("team_id", teamId)
    .eq("date", dateYmd)
    .in("time", bookingTimeMatchValues(timeHm))
    .eq("is_team_job", true)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .neq("id", params.excludeBookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AssignmentSlotConflictRow | null) ?? null;
}

export async function findIndividualCleanerSlotConflict(
  admin: SupabaseClient,
  params: { cleanerId: string; dateYmd: string; timeHm: string; excludeBookingId: string },
): Promise<AssignmentSlotConflictRow | null> {
  const cleanerId = params.cleanerId.trim();
  const dateYmd = params.dateYmd.trim();
  const timeHm = normalizeTimeHm(params.timeHm);
  if (!cleanerId || !dateYmd || !timeHm) return null;

  const { data, error } = await admin
    .from("bookings")
    .select("id, customer_name, time")
    .eq("cleaner_id", cleanerId)
    .eq("date", dateYmd)
    .in("time", bookingTimeMatchValues(timeHm))
    .eq("is_team_job", false)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .neq("id", params.excludeBookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AssignmentSlotConflictRow | null) ?? null;
}

/** Match both canonical `HH:MM` and legacy `HH:MM:SS` text stored on bookings.time. */
function bookingTimeMatchValues(timeHm: string): string[] {
  const hm = normalizeTimeHm(timeHm);
  if (!hm) return [];
  return hm.length === 5 ? [hm, `${hm}:00`] : [hm];
}

export function formatTeamAssignmentSlotConflictError(input: {
  kind: "team" | "cleaner";
  dateYmd: string;
  timeHm: string;
  conflict: AssignmentSlotConflictRow;
}): string {
  const who = String(input.conflict.customer_name ?? "another booking").trim() || "another booking";
  if (input.kind === "team") {
    return `This team is already assigned at ${input.dateYmd} ${input.timeHm} (${who}). Choose a different time or another team.`;
  }
  return `The team lead is already assigned at ${input.dateYmd} ${input.timeHm} (${who}). Choose a different time or another team.`;
}
