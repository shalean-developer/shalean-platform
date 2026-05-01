import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { runCleanerBookingLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let body: { bookingId?: unknown; cleanerId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!bookingId || !UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const action = actionRaw === "reject" ? "reject" : actionRaw === "accept" ? "accept" : null;
  if (!action) {
    return NextResponse.json({ error: "Invalid action. Use accept or reject." }, { status: 400 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  if (typeof body.cleanerId === "string" && body.cleanerId.trim() && body.cleanerId.trim() !== session.cleanerId) {
    return NextResponse.json({ error: "Cleaner mismatch." }, { status: 403 });
  }

  const { data: row, error: rowErr } = await admin.from("bookings").select("cleaner_id").eq("id", bookingId).maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const cid = String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  if (cid !== session.cleanerId) {
    return NextResponse.json({ error: "Not your job." }, { status: 403 });
  }

  const out = await runCleanerBookingLifecycleAction({
    admin,
    cleanerId: session.cleanerId,
    bookingId,
    action,
  });
  return NextResponse.json(out.json, { status: out.status });
}
