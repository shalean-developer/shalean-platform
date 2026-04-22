import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  status: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
};

function classifyBooking(row: Row, today: string): "today" | "upcoming" | "completed" {
  const st = row.status?.toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") return "completed";
  const d = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  if (!d) return "upcoming";
  if (d === today) return "today";
  if (d > today) return "upcoming";
  return "completed";
}

/**
 * Admin dashboard data. Requires signed-in user email in `ADMIN_EMAILS`.
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
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";

  const { data: rawRows, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, customer_email, service, date, time, location, total_paid_zar, amount_paid_cents, status, user_id, cleaner_id, assigned_at, en_route_at, started_at, completed_at, created_at, paystack_reference",
    )
    .order("created_at", { ascending: false })
    .limit(2500);

  if (selErr) {
    await reportOperationalIssue("error", "api/admin/bookings", selErr.message);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  const rows = (rawRows ?? []) as Row[];
  const today = todayYmdJohannesburg();

  let filtered = rows;
  if (filter === "today") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "today");
  } else if (filter === "upcoming") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "upcoming");
  } else if (filter === "completed") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "completed");
  }

  const zar = (r: Row) =>
    typeof r.total_paid_zar === "number"
      ? r.total_paid_zar
      : Math.round((r.amount_paid_cents ?? 0) / 100);

  const todayRows = rows.filter((r) => classifyBooking(r, today) === "today");
  const revenueTodayZar = todayRows.reduce((s, r) => s + zar(r), 0);
  const totalBookingsToday = todayRows.length;
  const aovTodayZar = totalBookingsToday > 0 ? Math.round(revenueTodayZar / totalBookingsToday) : 0;

  const byEmail = new Map<string, number>();
  for (const r of rows) {
    const em = r.customer_email?.trim().toLowerCase();
    if (!em) continue;
    byEmail.set(em, (byEmail.get(em) ?? 0) + 1);
  }
  const distinctCustomers = byEmail.size;
  const repeatCustomerCount = [...byEmail.values()].filter((c) => c >= 2).length;
  const repeatCustomerPercent =
    distinctCustomers > 0 ? Math.round((repeatCustomerCount / distinctCustomers) * 1000) / 10 : 0;

  const { data: failedJobs } = await admin
    .from("failed_jobs")
    .select("id, type, created_at, attempts, payload")
    .eq("type", "booking_insert")
    .order("created_at", { ascending: false })
    .limit(50);

  const missingUserIdCount = rows.filter((r) => r.user_id == null).length;

  const totalRevenueZar = rows.reduce((s, r) => s + zar(r), 0);
  const revenuePerCustomerZar =
    distinctCustomers > 0 ? Math.round(totalRevenueZar / distinctCustomers) : 0;

  const spendByEmail = new Map<string, { spendZar: number; bookings: number }>();
  for (const r of rows) {
    const em = r.customer_email?.trim().toLowerCase();
    if (!em) continue;
    const z = zar(r);
    const cur = spendByEmail.get(em) ?? { spendZar: 0, bookings: 0 };
    cur.spendZar += z;
    cur.bookings += 1;
    spendByEmail.set(em, cur);
  }
  const topCustomers = [...spendByEmail.entries()]
    .map(([email, v]) => ({ email, spendZar: v.spendZar, bookings: v.bookings }))
    .sort((a, b) => b.spendZar - a.spendZar)
    .slice(0, 10);

  const { data: profileRows } = await admin.from("user_profiles").select("tier");
  const vipDistribution = { regular: 0, silver: 0, gold: 0, platinum: 0 };
  for (const p of profileRows ?? []) {
    const t = typeof p === "object" && p && "tier" in p ? String((p as { tier?: string }).tier ?? "regular") : "regular";
    if (t === "silver") vipDistribution.silver++;
    else if (t === "gold") vipDistribution.gold++;
    else if (t === "platinum") vipDistribution.platinum++;
    else vipDistribution.regular++;
  }

  return NextResponse.json({
    bookings: filtered,
    metrics: {
      totalBookingsToday,
      revenueTodayZar,
      averageOrderValueTodayZar: aovTodayZar,
      repeatCustomerPercent,
      repeatBookingRatePercent: repeatCustomerPercent,
      revenuePerCustomerZar,
      missingUserIdCount,
      failedJobsCount: (failedJobs ?? []).length,
      vipDistribution,
      topCustomers,
    },
    failedJobs: failedJobs ?? [],
  });
}
