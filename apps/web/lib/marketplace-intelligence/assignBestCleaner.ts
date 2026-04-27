import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureBookingAssignment,
  type EnsureBookingAssignmentOptions,
} from "@/lib/dispatch/ensureBookingAssignment";
import type { AssignBookingResult } from "@/lib/dispatch/assignBooking";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getAiAutonomyFlags } from "@/lib/ai-autonomy/flags";
import { assignExperimentVariant } from "@/lib/ai-autonomy/experiments";
import { mergeAssignmentWeights } from "@/lib/ai-autonomy/modelWeights";

export type AssignBestCleanerResult =
  | AssignBookingResult
  | { ok: true; noOp: true; assignmentKind: "individual"; cleanerId: string }
  | { ok: true; noOp: true; assignmentKind: "team"; teamId: string };

/**
 * Paid-booking auto assignment with marketplace intelligence logging.
 * Does not override existing cleaner/team assignment (idempotent replays).
 * Does not assign unpaid rows (`assignBooking` enforces this; we short-circuit for clarity).
 */
export async function assignBestCleaner(
  supabase: SupabaseClient,
  bookingId: string,
  options: EnsureBookingAssignmentOptions,
): Promise<AssignBestCleanerResult> {
  const { data: row, error } = await supabase
    .from("bookings")
    .select("id, status, cleaner_id, team_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    void logSystemEvent({
      level: "warn",
      source: "assignment_failed",
      message: "assignBestCleaner: booking not readable",
      context: { bookingId, error: error?.message },
    });
    return { ok: false, error: "db_error", message: error?.message ?? "Booking not found" };
  }

  const st = String((row as { status?: string }).status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    void logSystemEvent({
      level: "info",
      source: "assignment_failed",
      message: "assignBestCleaner: skipped unpaid booking",
      context: { bookingId, status: st },
    });
    return { ok: false, error: "booking_not_pending", message: "Payment not completed — cleaner cannot be assigned yet." };
  }

  const isTeam = (row as { is_team_job?: boolean }).is_team_job === true;
  const teamId = String((row as { team_id?: string | null }).team_id ?? "").trim();
  if (isTeam && teamId && st === "assigned") {
    return { ok: true, noOp: true, assignmentKind: "team", teamId };
  }

  const cleanerId = String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  if (cleanerId && (st === "assigned" || st === "in_progress")) {
    return { ok: true, noOp: true, assignmentKind: "individual", cleanerId };
  }

  let dispatchOptions = options;
  const aiFlags = getAiAutonomyFlags();
  if (aiFlags.assignment) {
    const exp = await assignExperimentVariant(supabase, {
      subjectId: bookingId,
      experimentKey: "dispatch_assignment_ai_v1",
      rolloutPercent: 10,
      metadata: { source: options.source },
    });
    if (exp.variant === "variant") {
      const weights = await mergeAssignmentWeights(supabase);
      dispatchOptions = {
        ...options,
        smartAssign: {
          ...(options.smartAssign ?? {}),
          aiAssignmentVariant: "variant",
          aiAssignmentWeights: weights,
        },
      };
    }
  }

  const r = await ensureBookingAssignment(supabase, bookingId, dispatchOptions);

  if (r.ok) {
    void logSystemEvent({
      level: "info",
      source: "cleaner_assigned",
      message: "Marketplace assignment success",
      context: {
        bookingId,
        dispatchSource: options.source,
        assignmentKind: r.assignmentKind,
        cleanerId: r.assignmentKind === "individual" ? r.cleanerId : null,
        teamId: r.assignmentKind === "team" ? r.teamId : null,
      },
    });
    return r;
  }

  void logSystemEvent({
    level: "warn",
    source: "assignment_failed",
    message: "Marketplace assignment did not complete",
    context: {
      bookingId,
      dispatchSource: options.source,
      error: r.error,
      detail: r.message ?? null,
    },
  });

  return r;
}
