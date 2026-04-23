import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type VerifiedBookingAssignment = {
  id: string;
  cleaner_id: string;
  dispatch_status: string | null;
  assigned_at: string | null;
};

/** Structured success: host logs + `system_logs` (queryable). */
export function logAssignmentSuccess(params: { bookingId: string; cleanerId: string; source: string }): void {
  const context = {
    bookingId: params.bookingId,
    cleanerId: params.cleanerId,
    source: params.source,
    timestamp: new Date().toISOString(),
  };
  console.log("ASSIGNMENT_SUCCESS", context);
  void logSystemEvent({
    level: "info",
    source: "ASSIGNMENT_SUCCESS",
    message: "Assignment succeeded",
    context,
  });
}

/**
 * Confirms the booking row has a cleaner (source of truth for delivery).
 * @throws When the row is missing or `cleaner_id` is empty.
 */
export async function verifyBookingAssignment(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ cleaner_id: string; dispatch_status: string | null }> {
  const { data, error } = await admin
    .from("bookings")
    .select("cleaner_id, dispatch_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(`verifyBookingAssignment: read failed — ${error.message}`);
  }
  const cleanerId = data && typeof data === "object" ? String((data as { cleaner_id?: string | null }).cleaner_id ?? "").trim() : "";
  if (!cleanerId) {
    throw new Error("Booking not assigned");
  }
  const dispatch_status =
    data && typeof data === "object" ? String((data as { dispatch_status?: string | null }).dispatch_status ?? "") : "";
  return { cleaner_id: cleanerId, dispatch_status };
}

/**
 * After a direct assign write, confirms `cleaner_id`, `dispatch_status`, and `assigned_at`.
 * @throws When state does not match expectations (silent write failure / drift).
 */
export async function verifyBookingAssignmentExpectsCleaner(
  admin: SupabaseClient,
  bookingId: string,
  expectedCleanerId: string,
): Promise<VerifiedBookingAssignment> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, dispatch_status, assigned_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Assignment verify read failed: ${error.message}`);
  }
  const row = data as { id?: string; cleaner_id?: string | null; dispatch_status?: string | null; assigned_at?: string | null } | null;
  const cid = row?.cleaner_id != null ? String(row.cleaner_id).trim() : "";
  if (!row?.id || cid !== expectedCleanerId) {
    throw new Error("Assignment failed: cleaner_id not set correctly");
  }
  const ds = String(row.dispatch_status ?? "").toLowerCase();
  if (ds !== "assigned") {
    throw new Error(`Assignment failed: dispatch_status is "${row.dispatch_status ?? ""}"`);
  }
  if (!row.assigned_at) {
    throw new Error("Assignment failed: assigned_at not set");
  }
  return {
    id: String(row.id),
    cleaner_id: cid,
    dispatch_status: row.dispatch_status ?? null,
    assigned_at: row.assigned_at ?? null,
  };
}

/**
 * Same query shape as cleaner jobs list: `cleaner_id` + `id` only (no offers / user_id).
 * Returns false when the row is not readable with that filter (should not happen after service-role write).
 */
export async function verifyCleanerJobRowVisible(
  admin: SupabaseClient,
  bookingId: string,
  cleanerId: string,
  options?: { silent?: boolean },
): Promise<boolean> {
  const silent = options?.silent === true;
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    if (!silent) {
      console.error("ASSIGNMENT_VERIFY", { ok: false, bookingId, cleanerId, error: error.message });
      await logSystemEvent({
        level: "error",
        source: "booking_assignment_verify",
        message: `Job visibility check failed: ${error.message}`,
        context: { bookingId, cleanerId },
      });
    }
    return false;
  }
  if (!data || typeof data !== "object" || !("id" in data)) {
    if (!silent) {
      console.error("Cleaner cannot see assigned job", { bookingId, cleanerId });
      await logSystemEvent({
        level: "error",
        source: "booking_assignment_verify",
        message: "Cleaner cannot see assigned job (no row for cleaner_id + id)",
        context: { bookingId, cleanerId },
      });
    }
    return false;
  }
  return true;
}

/**
 * Same as {@link verifyCleanerJobRowVisible} but tolerates brief read-after-write lag.
 */
export async function verifyCleanerJobRowVisibleWithRetry(
  admin: SupabaseClient,
  bookingId: string,
  cleanerId: string,
  options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
  const attempts = Math.max(1, Math.min(10, options?.attempts ?? 3));
  const delayMs = Math.max(0, Math.min(2000, options?.delayMs ?? 300));

  for (let i = 0; i < attempts; i++) {
    const ok = await verifyCleanerJobRowVisible(admin, bookingId, cleanerId, { silent: true });
    if (ok) return true;
    if (i < attempts - 1) await sleep(delayMs);
  }

  await logSystemEvent({
    level: "error",
    source: "CLEANER_VISIBILITY_FAILED",
    message: "Job not visible after retries (same query as cleaner jobs list)",
    context: { bookingId, cleanerId, attempts, delayMs },
  });
  await reportOperationalIssue("error", "assignment_visibility", "CLEANER_VISIBILITY_FAILED", {
    bookingId,
    cleanerId,
    attempts,
    delayMs,
  });
  return false;
}
