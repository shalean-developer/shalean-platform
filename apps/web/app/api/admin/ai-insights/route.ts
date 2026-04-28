import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildAIBookingSummaryFromRows, generateAIInsights } from "@/lib/ai/generateAIInsights";
import type { InsightBookingRow } from "@/lib/ai/generateInsights";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopSlot = { time: string | null; bookings: number };
type TopService = { service: string | null; bookings: number };
type TopCustomer = { customer_email: string | null; revenue_zar: number; bookings: number };
type DropRow = { step: string; count: number };

/**
 * Revenue intelligence: aggregates from `bookings` + `user_events` (admin only).
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

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const wantNarrative = new URL(request.url).searchParams.get("narrative") === "1";
  if (wantNarrative) {
    const { data: narrativeRows, error: narrativeErr } = await admin
      .from("bookings")
      .select(
        "id, total_paid_zar, amount_paid_cents, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, service_fee_cents, location, cleaner_id, created_at, status, service",
      )
      .limit(8000);
    if (narrativeErr) {
      return NextResponse.json({ error: narrativeErr.message }, { status: 500 });
    }
    const rows = (narrativeRows ?? []) as InsightBookingRow[];
    const summary = buildAIBookingSummaryFromRows(rows);
    if (summary.completedSampleSize === 0) {
      return NextResponse.json({
        aiBusinessInsights: null,
        aiBusinessInsightsNote:
          "No completed bookings in this sample yet — complete jobs with stored revenue fields to enable AI narratives.",
        generatedAt: new Date().toISOString(),
      });
    }
    const gen = await generateAIInsights(summary);
    if (gen.ok) {
      return NextResponse.json({
        aiBusinessInsights: gen.text,
        generatedAt: new Date().toISOString(),
      });
    }
    if ("skipped" in gen) {
      return NextResponse.json({
        aiBusinessInsights: null,
        aiBusinessInsightsNote: gen.skipped,
        generatedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({ error: gen.error }, { status: 502 });
  }

  const { data: timeRows } = await admin.from("bookings").select("time").limit(8000);
  const timeCounts = new Map<string, number>();
  for (const r of timeRows ?? []) {
    const tm = r && typeof r === "object" && "time" in r ? String((r as { time?: string }).time ?? "") : "";
    if (!tm) continue;
    timeCounts.set(tm, (timeCounts.get(tm) ?? 0) + 1);
  }
  const bestTimeSlots: TopSlot[] = [...timeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([time, bookings]) => ({ time, bookings }));

  const { data: byService } = await admin.from("bookings").select("service").limit(8000);
  const svcCounts = new Map<string, number>();
  for (const r of byService ?? []) {
    const s = r && typeof r === "object" && "service" in r ? String((r as { service?: string }).service ?? "") : "";
    if (!s) continue;
    svcCounts.set(s, (svcCounts.get(s) ?? 0) + 1);
  }
  const popularServices: TopService[] = [...svcCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([service, bookings]) => ({ service, bookings }));

  const { data: revenueRows } = await admin.from("bookings").select("customer_email, total_paid_zar").limit(8000);
  const byEmail = new Map<string, { revenue: number; n: number }>();
  for (const r of revenueRows ?? []) {
    if (!r || typeof r !== "object") continue;
    const em = String((r as { customer_email?: string }).customer_email ?? "").trim().toLowerCase();
    if (!em) continue;
    const z = Number((r as { total_paid_zar?: number }).total_paid_zar ?? 0);
    const cur = byEmail.get(em) ?? { revenue: 0, n: 0 };
    cur.revenue += Number.isFinite(z) ? z : 0;
    cur.n += 1;
    byEmail.set(em, cur);
  }
  const highestRevenueCustomers: TopCustomer[] = [...byEmail.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([customer_email, v]) => ({
      customer_email,
      revenue_zar: v.revenue,
      bookings: v.n,
    }));

  const { data: dropEv } = await admin
    .from("user_events")
    .select("payload")
    .eq("event_type", "flow_drop_off")
    .order("created_at", { ascending: false })
    .limit(500);

  const dropMap = new Map<string, number>();
  for (const ev of dropEv ?? []) {
    const p = ev && typeof ev === "object" && "payload" in ev ? (ev as { payload?: unknown }).payload : null;
    const step =
      p && typeof p === "object" && p !== null && "step" in p
        ? String((p as { step?: string }).step ?? "unknown")
        : "unknown";
    dropMap.set(step, (dropMap.get(step) ?? 0) + 1);
  }
  const dropOffPoints: DropRow[] = [...dropMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([step, count]) => ({ step, count }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    bestTimeSlots: bestTimeSlots.length ? bestTimeSlots : [],
    popularServices,
    highestRevenueCustomers,
    dropOffPoints,
    note:
      dropOffPoints.length === 0
        ? "No flow_drop_off events yet — instrument steps to populate funnel drop-offs."
        : undefined,
  });
}
