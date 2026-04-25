import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type TeamAssignResult =
  | { ok: true; teamId: string }
  | { ok: false; error: "no_candidate" | "booking_not_pending" | "db_error"; message?: string };

type TeamRow = {
  id: string;
  capacity_per_day: number;
};

function bookingDateForWindow(dateYmd: string): { startIso: string; endIso: string } {
  const startIso = `${dateYmd}T00:00:00.000Z`;
  const endIso = `${dateYmd}T23:59:59.999Z`;
  return { startIso, endIso };
}

async function activeTeamMemberCount(
  supabase: SupabaseClient,
  teamId: string,
  dateYmd: string,
): Promise<number> {
  const { startIso, endIso } = bookingDateForWindow(dateYmd);
  const { data, error } = await supabase
    .from("team_members")
    .select("id, cleaner_id, active_from, active_to")
    .eq("team_id", teamId)
    .not("cleaner_id", "is", null);
  if (error) return 0;

  return (data ?? []).filter((raw) => {
    const r = raw as { active_from?: string | null; active_to?: string | null };
    const from = r.active_from ?? null;
    const to = r.active_to ?? null;
    if (from && from > endIso) return false;
    if (to && to < startIso) return false;
    return true;
  }).length;
}

async function hasCapacity(
  supabase: SupabaseClient,
  teamId: string,
  bookingDate: string,
  capacityPerDay: number,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_team_job", true)
    .eq("date", bookingDate)
    .in("status", ["pending", "assigned", "in_progress"]);
  if (error) return false;
  return (count ?? 0) < Math.max(1, capacityPerDay);
}

export async function assignTeamToBooking(
  supabase: SupabaseClient,
  booking: {
    id: string;
    status: string | null;
    cleaner_id: string | null;
    date: string | null;
  },
  serviceType: "deep_cleaning" | "move_cleaning",
): Promise<TeamAssignResult> {
  const st = String(booking.status ?? "").toLowerCase();
  if (st !== "pending" || booking.cleaner_id) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "Booking must be pending and unassigned for team assignment",
      context: { bookingId: booking.id, status: booking.status, cleanerId: booking.cleaner_id },
    });
    return { ok: false, error: "booking_not_pending", message: "Booking must be pending and unassigned." };
  }
  const dateYmd = String(booking.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    void logSystemEvent({
      level: "error",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "Booking date missing for team assignment",
      context: { bookingId: booking.id, bookingDate: booking.date },
    });
    return { ok: false, error: "db_error", message: "Booking date missing for team capacity check." };
  }

  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .select("id, capacity_per_day")
    .eq("is_active", true)
    .eq("service_type", serviceType)
    .order("created_at", { ascending: true })
    .limit(50);
  if (tErr) return { ok: false, error: "db_error", message: tErr.message };
  if (!teams?.length) {
    void logSystemEvent({
      level: "warn",
      source: "TEAM_ASSIGNMENT_FAILED",
      message: "No active teams available",
      context: { bookingId: booking.id, serviceType },
    });
    return { ok: false, error: "no_candidate", message: "No team available" };
  }

  let selected: TeamRow | null = null;
  for (const row of teams as TeamRow[]) {
    const memberCount = await activeTeamMemberCount(supabase, row.id, dateYmd);
    if (memberCount <= 0) {
      continue;
    }
    const okCapacity = await hasCapacity(supabase, row.id, dateYmd, Number(row.capacity_per_day ?? 0));
    if (!okCapacity) {
      void logSystemEvent({
        level: "info",
        source: "TEAM_CAPACITY_REJECTED",
        message: "Team has no remaining capacity",
        context: { bookingId: booking.id, teamId: row.id, bookingDate: dateYmd },
      });
      continue;
    }
    selected = row;
    break;
  }
  if (!selected) {
    const hasAnyActiveMembers = await Promise.all(
      (teams as TeamRow[]).map((row) => activeTeamMemberCount(supabase, row.id, dateYmd)),
    ).then((counts) => counts.some((c) => c > 0));
    if (!hasAnyActiveMembers) {
      void logSystemEvent({
        level: "warn",
        source: "TEAM_ASSIGNMENT_FAILED",
        message: "No active team members for selected service",
        context: { bookingId: booking.id, serviceType, bookingDate: dateYmd },
      });
      return { ok: false, error: "no_candidate", message: "No active team members" };
    }
    return { ok: false, error: "no_candidate", message: "Team capacity exceeded" };
  }

  const capacity = Math.max(1, Number(selected.capacity_per_day ?? 0));
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_team_capacity_slot", {
    p_team_id: selected.id,
    p_booking_date: dateYmd,
    p_capacity_per_day: capacity,
  });
  if (claimErr) {
    return { ok: false, error: "db_error", message: claimErr.message };
  }
  if (claimed !== true) {
    void logSystemEvent({
      level: "info",
      source: "TEAM_CAPACITY_REJECTED",
      message: "Atomic capacity claim rejected",
      context: { bookingId: booking.id, teamId: selected.id, bookingDate: dateYmd },
    });
    return { ok: false, error: "no_candidate", message: "Team capacity exceeded" };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: uErr } = await supabase
    .from("bookings")
    .update({
      cleaner_id: null,
      is_team_job: true,
      team_id: selected.id,
      status: "assigned",
      dispatch_status: "assigned",
      assigned_at: nowIso,
    })
    .eq("id", booking.id)
    .eq("status", "pending")
    .is("cleaner_id", null)
    .select("id")
    .maybeSingle();
  if (uErr || !updated) {
    await supabase.rpc("release_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
    });
    if (uErr) return { ok: false, error: "db_error", message: uErr.message };
    return { ok: false, error: "booking_not_pending", message: "Booking state changed." };
  }

  const { error: insErr } = await supabase.from("booking_team_assignments").insert({
    booking_id: booking.id,
    team_id: selected.id,
    status: "assigned",
    assigned_at: nowIso,
  });
  if (insErr) {
    await supabase.rpc("release_team_capacity_slot", {
      p_team_id: selected.id,
      p_booking_date: dateYmd,
    });
    return { ok: false, error: "db_error", message: insErr.message };
  }

  void logSystemEvent({
    level: "info",
    source: "TEAM_ASSIGNMENT_SUCCESS",
    message: "Team assigned to booking",
    context: { bookingId: booking.id, teamId: selected.id, bookingDate: dateYmd, serviceType },
  });

  return { ok: true, teamId: selected.id };
}

