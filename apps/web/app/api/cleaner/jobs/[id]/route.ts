import { NextResponse } from "next/server";
import { assignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "accept" | "reject" | "en_route" | "start" | "complete";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = (typeof body.action === "string" ? body.action.trim() : "") as Action;
  const allowed: Action[] = ["accept", "reject", "en_route", "start", "complete"];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, status, assignment_attempts")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String((booking as { cleaner_id?: string }).cleaner_id) !== cleanerId) {
    return NextResponse.json({ error: "Not your job." }, { status: 403 });
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "accept") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "Job is not in assigned state." }, { status: 400 });
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "assigned" });
  }

  if (action === "reject") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "You can only reject before starting the job." }, { status: 400 });
    }
    const attempts = Number((booking as { assignment_attempts?: number }).assignment_attempts ?? 0);
    const { error: uErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: null,
        status: "pending",
        assigned_at: null,
        en_route_at: null,
        started_at: null,
        assignment_attempts: attempts + 1,
      })
      .eq("id", bookingId);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    await syncCleanerBusyFromBookings(admin, cleanerId);

    const auto = process.env.AUTO_DISPATCH_CLEANERS !== "false";
    if (auto) {
      const r = await assignCleanerToBooking(admin, bookingId);
      if (r.ok) {
        await notifyCleanerAssignedBooking(admin, bookingId, r.cleanerId);
      } else {
        await reportOperationalIssue("warn", "cleaner/reject", "Re-dispatch failed", {
          bookingId,
          reason: r.error,
        });
      }
    }

    return NextResponse.json({ ok: true, status: "pending", reassigned: auto });
  }

  if (action === "en_route") {
    if (st !== "assigned" && st !== "in_progress") {
      return NextResponse.json({ error: "Invalid state for en_route." }, { status: 400 });
    }
    const { error: uErr } = await admin.from("bookings").update({ en_route_at: now }).eq("id", bookingId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: st });
  }

  if (action === "start") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "Start requires assigned state." }, { status: 400 });
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "in_progress", started_at: now })
      .eq("id", bookingId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "in_progress" });
  }

  if (action === "complete") {
    if (st !== "in_progress") {
      return NextResponse.json({ error: "Mark the job as started before completing." }, { status: 400 });
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: now })
      .eq("id", bookingId);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    const { data: cj } = await admin.from("cleaners").select("jobs_completed").eq("id", cleanerId).maybeSingle();
    const prev = cj && typeof cj === "object" ? Number((cj as { jobs_completed?: number }).jobs_completed ?? 0) : 0;
    await admin.from("cleaners").update({ jobs_completed: prev + 1 }).eq("id", cleanerId);

    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "completed" });
  }

  return NextResponse.json({ error: "Unsupported." }, { status: 400 });
}
