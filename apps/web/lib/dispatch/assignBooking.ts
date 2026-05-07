import type { SupabaseClient } from "@supabase/supabase-js";
import { assignCleanerToBooking, type AssignCleanerOptions } from "@/lib/dispatch/assignCleaner";
import { assignTeamToBooking } from "@/lib/dispatch/assignTeamToBooking";
import { shouldUseTeamAssignment } from "@/lib/dispatch/shouldUseTeamAssignment";
import { isTeamService, teamServiceType } from "@/lib/dispatch/teamServiceDetection";

export type { TeamBookingServiceRef } from "@/lib/dispatch/teamServiceDetection";
export { isTeamService, teamServiceType } from "@/lib/dispatch/teamServiceDetection";

export type AssignBookingResult =
  | { ok: true; assignmentKind: "individual"; cleanerId: string }
  | { ok: true; assignmentKind: "team"; teamId: string }
  | {
      ok: false;
      error: "no_candidate" | "booking_not_pending" | "db_error";
      message?: string;
      code?: string;
      booking_id?: string;
      team_id?: string;
      error_id?: string;
    };

export async function assignBooking(
  supabase: SupabaseClient,
  bookingId: string,
  options?: AssignCleanerOptions,
): Promise<AssignBookingResult> {
  const enableTeamAssignment = process.env.ENABLE_TEAM_ASSIGNMENT === "true";

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, status, cleaner_id, date, time, service, location, booking_snapshot")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: "db_error", message: bErr?.message ?? "Booking not found" };

  const b = booking as {
    id: string;
    status: string | null;
    cleaner_id: string | null;
    date: string | null;
    time: string | null;
    service: string | null;
    location: string | null;
    booking_snapshot?: unknown;
  };

  const paySt = String(b.status ?? "").toLowerCase();
  if (paySt === "pending_payment" || paySt === "payment_expired") {
    return {
      ok: false,
      error: "booking_not_pending",
      message: "Payment not completed — cleaner cannot be assigned yet.",
    };
  }

  const teamService = isTeamService(b);
  const scopeAllowsTeam = shouldUseTeamAssignment({
    serviceType: b.service,
    locationSlug: b.location,
  });

  if (!enableTeamAssignment || !teamService || !scopeAllowsTeam) {
    const r = await assignCleanerToBooking(supabase, bookingId, options);
    if (!r.ok) return r;
    return { ok: true, assignmentKind: "individual", cleanerId: r.cleanerId };
  }

  const serviceType = teamServiceType(b);
  const team = await assignTeamToBooking(
    supabase,
    { id: b.id, status: b.status, cleaner_id: b.cleaner_id, date: b.date, time: b.time },
    serviceType,
  );
  if (!team.ok) return team;
  return { ok: true, assignmentKind: "team", teamId: team.teamId };
}

