import "server-only";

import { tryOnceReassignAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import { logSystemEvent } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

/** No accept/decline after this many minutes → release cleaner and try one reassignment. */
export const ASSIGNMENT_ACK_TIMEOUT_MINUTES = 10;

const MAX_BATCH = 40;

type StaleAssignedRow = {
  id: string;
  date: string | null;
  time: string | null;
  cleaner_id: string | null;
};

/**
 * Finds `assigned` bookings whose `assigned_at` is older than {@link ASSIGNMENT_ACK_TIMEOUT_MINUTES},
 * moves each to `pending_assignment` / `unassigned`, then runs one reassignment attempt (excluding prior cleaner).
 */
export async function runAssignmentAckTimeouts(admin: SupabaseClient): Promise<{ processed: number; errors: number }> {
  const cutoff = new Date(Date.now() - ASSIGNMENT_ACK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: rows, error: selErr } = await admin
    .from("bookings")
    .select("id, date, time, cleaner_id, status, assigned_at, cleaner_response_status, is_team_job")
    .eq("status", "assigned")
    .not("assigned_at", "is", null)
    .lt("assigned_at", cutoff)
    .or("cleaner_response_status.is.null,cleaner_response_status.eq.none,cleaner_response_status.eq.pending")
    .limit(MAX_BATCH);

  if (selErr || !rows?.length) {
    if (selErr) {
      await logSystemEvent({
        level: "warn",
        source: "assignment_ack_timeout",
        message: "Failed to load stale assigned bookings",
        context: { message: selErr.message },
      });
    }
    return { processed: 0, errors: selErr ? 1 : 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const raw of rows) {
    const row = raw as StaleAssignedRow & { is_team_job?: boolean | null };
    if (row.is_team_job === true) continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;

    const prevCleaner = typeof row.cleaner_id === "string" && row.cleaner_id ? row.cleaner_id : "";

    const { data: updated, error: upErr } = await admin
      .from("bookings")
      .update({
        status: "pending_assignment",
        dispatch_status: "unassigned",
        cleaner_id: null,
        assigned_at: null,
        last_declined_by_cleaner_id: null,
        last_declined_at: null,
      })
      .eq("id", id)
      .eq("status", "assigned")
      .select("id")
      .maybeSingle();

    if (upErr || !updated) {
      if (upErr) errors += 1;
      continue;
    }

    processed += 1;

    await logSystemEvent({
      level: "info",
      source: "assignment_ack_timeout",
      message: "Released assigned booking after ack timeout",
      context: {
        bookingId: id,
        previousCleanerId: prevCleaner || null,
        timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES,
      },
    });

    const slotDate = String(row.date ?? "").trim();
    const slotTime = String(row.time ?? "").trim();
    await tryOnceReassignAfterDecline(admin, {
      bookingId: id,
      slotDate,
      slotTime,
      declinedCleanerId: prevCleaner,
    });
  }

  return { processed, errors };
}
