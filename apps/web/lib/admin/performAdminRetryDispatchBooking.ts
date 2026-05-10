import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

const ADMIN_RETRY_DISPATCH_COOLDOWN_MS = 10_000;

/** Dispatch states ops can clear to re-run auto-assign (or then assign manually). */
const TERMINAL_DISPATCH_RESET = ["failed", "unassignable", "no_cleaner"] as const;

export type AdminRetryDispatchSuccessBody =
  | { ok: true; assignmentKind: "individual"; cleanerId: string }
  | { ok: true; assignmentKind: "team"; teamId: string };

export type AdminRetryDispatchHttpResult =
  | { status: 200; body: AdminRetryDispatchSuccessBody }
  | { status: 404; body: { error: string } }
  | { status: 422; body: { error: string } | { ok: false; error: string; message: string | null } }
  | { status: 429; body: { error: string } }
  | { status: 409; body: { error: string } }
  | { status: 500; body: { error: string } };

export type AdminRetryDispatchBookingParams = {
  admin: SupabaseClient;
  bookingId: string;
  actorUserId: string;
  actorEmail: string | null;
};

/**
 * Admin retry-dispatch: clear terminal dispatch backoff, reset booking dispatch fields, run one soft assign wave.
 * Extracted from the admin API route so {@link retryDispatchBooking} can wrap without changing behavior.
 */
export async function performAdminRetryDispatchBooking(
  params: AdminRetryDispatchBookingParams,
): Promise<AdminRetryDispatchHttpResult> {
  const { admin, bookingId, actorUserId, actorEmail } = params;

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select("id, status, cleaner_id, dispatch_status, last_admin_retry_dispatch_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return { status: 404, body: { error: selErr?.message ?? "Booking not found." } };
  }

  const st = String((row as { status?: string }).status ?? "").toLowerCase();
  const ds = String((row as { dispatch_status?: string | null }).dispatch_status ?? "").toLowerCase();
  if (st !== "pending" || (row as { cleaner_id?: string | null }).cleaner_id) {
    return { status: 422, body: { error: "Booking must be pending and unassigned." } };
  }
  if (!TERMINAL_DISPATCH_RESET.includes(ds as (typeof TERMINAL_DISPATCH_RESET)[number])) {
    return {
      status: 422,
      body: {
        error: `Retry dispatch is only for bookings with dispatch_status one of: ${TERMINAL_DISPATCH_RESET.join(", ")}.`,
      },
    };
  }

  const lastRetryIso = (row as { last_admin_retry_dispatch_at?: string | null }).last_admin_retry_dispatch_at ?? null;
  if (lastRetryIso) {
    const elapsed = Date.now() - new Date(lastRetryIso).getTime();
    if (elapsed >= 0 && elapsed < ADMIN_RETRY_DISPATCH_COOLDOWN_MS) {
      return { status: 429, body: { error: "Please wait a few seconds before retrying." } };
    }
  }

  await admin.from("dispatch_retry_queue").delete().eq("booking_id", bookingId).eq("status", "pending");

  const retryStamp = new Date().toISOString();
  const { data: resetRows, error: resetErr } = await admin
    .from("bookings")
    .update({
      dispatch_status: "searching",
      dispatch_attempt_count: 0,
      dispatch_next_recovery_at: null,
      dispatch_recovery_lease_until: null,
      last_admin_retry_dispatch_at: retryStamp,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .is("cleaner_id", null)
    .in("dispatch_status", [...TERMINAL_DISPATCH_RESET])
    .select("id");

  if (resetErr) {
    return { status: 500, body: { error: resetErr.message } };
  }
  if (!resetRows?.length) {
    return { status: 409, body: { error: "Booking state changed, refresh and try again." } };
  }

  await logSystemEvent({
    level: "info",
    source: "admin_retry_dispatch",
    message: "Admin retry dispatch",
    context: {
      bookingId,
      prior_dispatch_status: ds,
      actor_user_id: actorUserId,
      actor_email: actorEmail,
    },
  });

  metrics.increment("dispatch.admin_terminal_reset", { bookingId, from: ds });

  const result = await ensureBookingAssignment(admin, bookingId, {
    source: "admin_dispatch_api",
    smartAssign: { assignmentMode: "soft" },
  });

  if (result.ok) {
    metrics.increment("dispatch.recovery.success_after_failure", {
      bookingId,
      source: "admin_retry_dispatch",
    });
    if (result.assignmentKind === "individual") {
      return { status: 200, body: { ok: true, assignmentKind: "individual", cleanerId: result.cleanerId } };
    }
    return { status: 200, body: { ok: true, assignmentKind: "team", teamId: result.teamId } };
  }

  return {
    status: 422,
    body: { ok: false, error: result.error, message: result.message ?? null },
  };
}
