import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESCHEDULE_STATUSES = new Set(["pending", "confirmed", "assigned"]);

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
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
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  let body: { date?: string; time?: string };
  try {
    body = (await request.json()) as { date?: string; time?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const timeRaw = typeof body.time === "string" ? body.time.trim() : "";
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  if (!isYmd(date) || !isHm(time)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and time (HH:MM) required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await admin
    .from("bookings")
    .select("id, user_id, status, started_at, en_route_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String((row as { user_id?: string }).user_id) !== userData.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const status = String((row as { status?: string }).status ?? "").toLowerCase();
  if (!RESCHEDULE_STATUSES.has(status)) {
    return NextResponse.json({ error: "This booking cannot be rescheduled." }, { status: 400 });
  }

  if ((row as { started_at?: string | null }).started_at || (row as { en_route_at?: string | null }).en_route_at) {
    return NextResponse.json({ error: "Cannot reschedule after the cleaner is on the way or started." }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from("bookings")
    .update({ date, time })
    .eq("id", bookingId)
    .eq("user_id", userData.user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
