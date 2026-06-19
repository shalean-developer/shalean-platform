import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { computeOfficeTodayScheduleStats } from "@/lib/admin/officeTodayScheduleStats";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_SELECT =
  "id, date, time, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, customer_name, service, service_slug, location, ignore_cleaner_conflict, cleaner_slot_override_reason, dispatch_status";

/**
 * Admin: bookings for a single calendar day (schedule board).
 */
export async function GET(request: Request) {
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

  const date = new URL(request.url).searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Query `date` must be YYYY-MM-DD." }, { status: 400 });
  }

  const cleanerId = new URL(request.url).searchParams.get("cleanerId")?.trim() ?? "";

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let q = admin.from("bookings").select(BOOKING_SELECT).eq("date", date).order("time", { ascending: true }).limit(800);
  if (/^[0-9a-f-]{36}$/i.test(cleanerId)) {
    q = q.or(
      `and(cleaner_id.is.null,selected_cleaner_id.is.null),cleaner_id.eq.${cleanerId},selected_cleaner_id.eq.${cleanerId}`,
    );
  }

  const { data: bookings, error: bErr } = await q;
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const cleanerSelectWithRoster = "id, full_name, phone, is_available, status, availability_weekdays";
  const cleanerSelectBase = "id, full_name, phone, is_available, status";
  let { data: cleanerRows, error: cErr } = await admin
    .from("cleaners")
    .select(cleanerSelectWithRoster)
    .order("full_name", { ascending: true });

  if (cErr && isUnknownColumnError(cErr, "availability_weekdays")) {
    const fallback = await admin.from("cleaners").select(cleanerSelectBase).order("full_name", { ascending: true });
    cleanerRows = (fallback.data ?? []).map((row) => ({ ...row, availability_weekdays: null }));
    cErr = fallback.error;
  }

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  return NextResponse.json({
    date,
    bookings: bookings ?? [],
    cleaners: cleanerRows ?? [],
    summary: computeOfficeTodayScheduleStats(bookings ?? []),
  });
}
