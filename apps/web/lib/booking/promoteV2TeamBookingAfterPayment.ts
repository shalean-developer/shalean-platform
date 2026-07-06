import type { SupabaseClient } from "@supabase/supabase-js";
import { assignSpecificTeamToPendingBooking } from "@/lib/dispatch/assignTeamToBooking";
import { syncBookingCleanersForTeamBooking } from "@/lib/booking/syncBookingCleanersForTeamBooking";
import { logSystemEvent } from "@/lib/logging/systemLog";

export function teamServiceTypeFromBookingSlug(
  serviceSlug: string | null | undefined,
): "deep_cleaning" | "move_cleaning" {
  const slug = String(serviceSlug ?? "")
    .trim()
    .toLowerCase()
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (slug === "moving_cleaning" || slug === "move" || slug.startsWith("move_")) {
    return "move_cleaning";
  }
  return "deep_cleaning";
}

/**
 * Booking V2 team checkout: customer picks `assigned_team_id` at confirm time.
 * After payment, promote that choice to operational team assignment (`team_id`,
 * `is_team_job`, `booking_cleaners` roster) so cleaner / office / account surfaces
 * converge on the same row the customer booked.
 */
export async function promoteV2TeamBookingAfterPayment(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true; assigned: boolean } | { ok: false; error: string }> {
  const bid = String(bookingId ?? "").trim();
  if (!bid) return { ok: false, error: "missing_booking_id" };

  const { data: row, error } = await admin
    .from("bookings")
    .select(
      "id, status, cleaner_mode, assigned_team_id, team_id, is_team_job, cleaner_id, date, service_slug, service",
    )
    .eq("id", bid)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "booking_not_found" };

  const mode = String((row as { cleaner_mode?: string | null }).cleaner_mode ?? "").trim().toLowerCase();
  const assignedTeamId = String((row as { assigned_team_id?: string | null }).assigned_team_id ?? "").trim();
  if (mode !== "team" || !assignedTeamId) {
    return { ok: true, assigned: false };
  }

  const teamId = String((row as { team_id?: string | null }).team_id ?? "").trim();
  const isTeamJob = (row as { is_team_job?: boolean | null }).is_team_job === true;
  if (isTeamJob && teamId === assignedTeamId) {
    await syncBookingCleanersForTeamBooking(admin, bid, "dispatch");
    return { ok: true, assigned: false };
  }

  const st = String((row as { status?: string | null }).status ?? "").trim().toLowerCase();
  const cleanerId = String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  if (st !== "pending" || cleanerId) {
    return { ok: true, assigned: false };
  }

  const dateYmd = String((row as { date?: string | null }).date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, error: "booking_date_invalid_for_team_assign" };
  }

  const serviceSlug = String(
    (row as { service_slug?: string | null }).service_slug ??
      (row as { service?: string | null }).service ??
      "",
  ).trim();

  const assign = await assignSpecificTeamToPendingBooking(admin, {
    bookingId: bid,
    teamId: assignedTeamId,
    dateYmd,
    serviceType: teamServiceTypeFromBookingSlug(serviceSlug),
  });

  if (!assign.ok) {
    void logSystemEvent({
      level: "warn",
      source: "promoteV2TeamBookingAfterPayment",
      message: "v2_team_assign_failed",
      context: {
        bookingId: bid,
        assignedTeamId,
        error: assign.error,
        detail: assign.message ?? null,
        code: assign.code ?? null,
      },
    });
    return { ok: false, error: assign.message ?? assign.error };
  }

  void logSystemEvent({
    level: "info",
    source: "promoteV2TeamBookingAfterPayment",
    message: "v2_team_assigned_after_payment",
    context: { bookingId: bid, teamId: assign.teamId },
  });

  return { ok: true, assigned: true };
}
