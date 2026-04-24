import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { aggregateCleanerPerformance, type BookingPerfInput } from "@/lib/admin/cleanerPerformance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rawDays = Number(searchParams.get("days") ?? "120");
  const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(14, rawDays)) : 120;
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  const fromYmd = from.toISOString().slice(0, 10);

  const [{ data: bookingRows, error: bErr }, { data: cleanerRows, error: cErr }] = await Promise.all([
    admin
      .from("bookings")
      .select("cleaner_id, date, time, started_at, completed_at, status")
      .not("cleaner_id", "is", null)
      .gte("date", fromYmd)
      .limit(12_000),
    admin.from("cleaners").select("id, full_name"),
  ]);

  if (bErr || cErr) {
    return NextResponse.json({ error: bErr?.message ?? cErr?.message ?? "Query failed." }, { status: 500 });
  }

  const names = new Map<string, string>();
  for (const c of cleanerRows ?? []) {
    const row = c as { id?: string; full_name?: string | null };
    if (row.id) names.set(String(row.id), String(row.full_name ?? ""));
  }

  const bookings = (bookingRows ?? []) as BookingPerfInput[];
  const { cleaners, fleetTrend7d } = aggregateCleanerPerformance(bookings, names);

  return NextResponse.json({
    cleaners,
    fleetTrend7d,
    meta: { days, fromYmd, bookingCount: bookings.length },
  });
}
