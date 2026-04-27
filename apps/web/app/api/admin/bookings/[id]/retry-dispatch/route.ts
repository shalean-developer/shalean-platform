import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ADMIN_RETRY_DISPATCH_COOLDOWN_MS = 10_000;

/** Dispatch states ops can clear to re-run auto-assign (or then assign manually). */
const TERMINAL_DISPATCH_RESET = ["failed", "unassignable", "no_cleaner"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears terminal dispatch backoff / attempt cap side-effects and runs one auto-assign wave (soft).
 * For ops when `dispatch_status` is `failed`, `unassignable`, or `no_cleaner` on a paid pending booking.
 *
 * Idempotent under double-submit: the reset `update` requires a matching terminal `dispatch_status`,
 * so a second in-flight request after the first succeeds will update 0 rows (409) and does not corrupt state.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select("id, status, cleaner_id, dispatch_status, last_admin_retry_dispatch_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return NextResponse.json({ error: selErr?.message ?? "Booking not found." }, { status: 404 });
  }

  const st = String((row as { status?: string }).status ?? "").toLowerCase();
  const ds = String((row as { dispatch_status?: string | null }).dispatch_status ?? "").toLowerCase();
  if (st !== "pending" || (row as { cleaner_id?: string | null }).cleaner_id) {
    return NextResponse.json({ error: "Booking must be pending and unassigned." }, { status: 422 });
  }
  if (!TERMINAL_DISPATCH_RESET.includes(ds as (typeof TERMINAL_DISPATCH_RESET)[number])) {
    return NextResponse.json(
      {
        error: `Retry dispatch is only for bookings with dispatch_status one of: ${TERMINAL_DISPATCH_RESET.join(", ")}.`,
      },
      { status: 422 },
    );
  }

  const lastRetryIso = (row as { last_admin_retry_dispatch_at?: string | null }).last_admin_retry_dispatch_at ?? null;
  if (lastRetryIso) {
    const elapsed = Date.now() - new Date(lastRetryIso).getTime();
    if (elapsed >= 0 && elapsed < ADMIN_RETRY_DISPATCH_COOLDOWN_MS) {
      return NextResponse.json(
        { error: "Please wait a few seconds before retrying." },
        { status: 429 },
      );
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
    return NextResponse.json({ error: resetErr.message }, { status: 500 });
  }
  if (!resetRows?.length) {
    return NextResponse.json(
      { error: "Booking state changed, refresh and try again." },
      { status: 409 },
    );
  }

  await logSystemEvent({
    level: "info",
    source: "admin_retry_dispatch",
    message: "Admin retry dispatch",
    context: {
      bookingId,
      prior_dispatch_status: ds,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
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
      return NextResponse.json({ ok: true, assignmentKind: "individual", cleanerId: result.cleanerId });
    }
    return NextResponse.json({ ok: true, assignmentKind: "team", teamId: result.teamId });
  }

  return NextResponse.json(
    { ok: false, error: result.error, message: result.message ?? null },
    { status: 422 },
  );
}
