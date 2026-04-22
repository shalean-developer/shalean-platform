import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { isBookingTimeInWindow } from "@/lib/dispatch/timeWindow";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: { cleanerId?: string; force?: boolean };
  try {
    body = (await request.json()) as { cleanerId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const cleanerId = typeof body.cleanerId === "string" ? body.cleanerId.trim() : "";
  if (!cleanerId) {
    return NextResponse.json({ error: "cleanerId required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, status, cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") {
    return NextResponse.json({ error: "Booking cannot be assigned in this state." }, { status: 400 });
  }

  const dateYmd = String((booking as { date?: string }).date ?? "");
  const timeHm = String((booking as { time?: string }).time ?? "");
  const force = body.force === true;

  if (!force && dateYmd && timeHm) {
    const { data: windows } = await admin
      .from("cleaner_availability")
      .select("start_time, end_time, is_available")
      .eq("cleaner_id", cleanerId)
      .eq("date", dateYmd)
      .eq("is_available", true);

    let ok = false;
    for (const w of windows ?? []) {
      if (
        w &&
        typeof w === "object" &&
        "start_time" in w &&
        "end_time" in w &&
        isBookingTimeInWindow(timeHm, String((w as { start_time: string }).start_time), String((w as { end_time: string }).end_time))
      ) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      return NextResponse.json(
        { error: "Cleaner has no availability for this slot. Pass force=true to override." },
        { status: 400 },
      );
    }
  }

  const prevCleaner = (booking as { cleaner_id?: string | null }).cleaner_id;

  const now = new Date().toISOString();
  const { error: uErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: cleanerId,
      status: "assigned",
      assigned_at: now,
    })
    .eq("id", bookingId);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  if (prevCleaner && prevCleaner !== cleanerId) {
    await syncCleanerBusyFromBookings(admin, prevCleaner);
  }
  await syncCleanerBusyFromBookings(admin, cleanerId);
  await notifyCleanerAssignedBooking(admin, bookingId, cleanerId);

  return NextResponse.json({ ok: true, cleanerId });
}
