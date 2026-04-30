import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Channel = "google_ads" | "facebook_ads" | "organic_seo" | "direct";
const CHANNELS: Channel[] = ["google_ads", "facebook_ads", "organic_seo", "direct"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysForRange(range: string): number {
  if (range === "today") return 1;
  if (range === "30d") return 30;
  return 7;
}

async function assertAdmin(request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email || !isAdmin(user.email)) return { ok: false, status: 403, error: "Forbidden." };
  return { ok: true };
}

function inferChannel(payload: Record<string, unknown>): Channel {
  const source = String(payload.source ?? "").toLowerCase();
  const pathname = String(payload.pathname ?? "").toLowerCase();
  const pageType = String(payload.page_type ?? "").toLowerCase();
  if (source.includes("ads_lp") || pageType === "google_ads_lp" || pathname.startsWith("/lp/cleaning")) return "google_ads";
  if (source.includes("facebook")) return "facebook_ads";
  if (pathname.startsWith("/locations/") || pathname.startsWith("/cleaning-services/")) return "organic_seo";
  return "direct";
}

export async function GET(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "7d";
  const days = daysForRange(range);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceYmd = ymd(since);

  const [eventsRes, spendRes] = await Promise.all([
    admin
      .from("user_events")
      .select("event_type, booking_id, created_at, payload")
      .gte("created_at", `${sinceYmd}T00:00:00.000Z`)
      .in("event_type", ["page_view", "start_booking", "view_price", "select_time", "complete_booking"])
      .order("created_at", { ascending: true })
      .limit(50000),
    admin.from("marketing_spend").select("channel, amount, date").gte("date", sinceYmd).limit(20000),
  ]);

  if (eventsRes.error) return NextResponse.json({ error: eventsRes.error.message }, { status: 500 });
  if (spendRes.error) return NextResponse.json({ error: spendRes.error.message }, { status: 500 });

  const events = (eventsRes.data ?? []) as Array<{
    event_type: string | null;
    booking_id: string | null;
    created_at: string | null;
    payload: Record<string, unknown> | null;
  }>;

  const completeEvents = events.filter((e) => String(e.event_type) === "complete_booking");
  const bookingIds = [...new Set(completeEvents.map((e) => e.booking_id).filter(Boolean))] as string[];
  const bookingsRevenueRes =
    bookingIds.length === 0
      ? { data: [], error: null }
      : await admin.from("bookings").select("id, total_paid_zar, amount_paid_cents").in("id", bookingIds);
  if (bookingsRevenueRes.error) return NextResponse.json({ error: bookingsRevenueRes.error.message }, { status: 500 });

  const bookingRevenue = new Map<string, number>();
  for (const row of bookingsRevenueRes.data ?? []) {
    const amount =
      typeof row.total_paid_zar === "number"
        ? row.total_paid_zar
        : Math.round(Number(row.amount_paid_cents ?? 0) / 100);
    bookingRevenue.set(String(row.id), Number.isFinite(amount) ? amount : 0);
  }

  const funnel = { visitors: 0, started: 0, viewedPrice: 0, selectedTime: 0, completed: 0 };
  const sessionsByChannel = new Map<string, Channel>();
  const channels = new Map<Channel, { spend: number; bookings: number; revenue: number }>();
  for (const ch of CHANNELS) channels.set(ch, { spend: 0, bookings: 0, revenue: 0 });

  const trend = new Map<string, { spend: number; revenue: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    trend.set(ymd(d), { spend: 0, revenue: 0 });
  }

  for (const ev of events) {
    const type = String(ev.event_type ?? "");
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const sid = String(payload.session_id ?? "");
    const date = String(ev.created_at ?? "").slice(0, 10);

    if (type === "page_view") funnel.visitors += 1;
    if (type === "start_booking") funnel.started += 1;
    if (type === "view_price") funnel.viewedPrice += 1;
    if (type === "select_time") funnel.selectedTime += 1;
    if (type === "complete_booking") funnel.completed += 1;

    if (sid) {
      if (!sessionsByChannel.has(sid)) sessionsByChannel.set(sid, inferChannel(payload));
    }

    if (type === "complete_booking") {
      const channel = sid && sessionsByChannel.has(sid) ? sessionsByChannel.get(sid)! : inferChannel(payload);
      const row = channels.get(channel)!;
      row.bookings += 1;
      const revenue = ev.booking_id ? bookingRevenue.get(ev.booking_id) ?? 0 : 0;
      row.revenue += revenue;
      const day = trend.get(date);
      if (day) day.revenue += revenue;
    }
  }

  for (const row of spendRes.data ?? []) {
    const channel = String(row.channel) as Channel;
    const amount = Number(row.amount ?? 0);
    if (!channels.has(channel) || !Number.isFinite(amount)) continue;
    channels.get(channel)!.spend += amount;
    const day = trend.get(String(row.date));
    if (day) day.spend += amount;
  }

  const channelRows = CHANNELS.map((channel) => {
    const row = channels.get(channel)!;
    const cpa = row.bookings > 0 ? row.spend / row.bookings : 0;
    const roas = row.spend > 0 ? row.revenue / row.spend : 0;
    return { channel, ...row, cpa, roas };
  });

  const adChannels = channelRows.filter((c) => c.channel === "google_ads" || c.channel === "facebook_ads");
  const totalAdSpend = adChannels.reduce((s, c) => s + c.spend, 0);
  const totalBookingsFromAds = adChannels.reduce((s, c) => s + c.bookings, 0);
  const revenueFromAds = adChannels.reduce((s, c) => s + c.revenue, 0);
  const cpa = totalBookingsFromAds > 0 ? totalAdSpend / totalBookingsFromAds : 0;
  const roas = totalAdSpend > 0 ? revenueFromAds / totalAdSpend : 0;
  const profit = revenueFromAds - totalAdSpend;

  const nonZero = channelRows.filter((c) => c.bookings > 0 || c.spend > 0 || c.revenue > 0);
  const best = [...nonZero].sort((a, b) => b.roas - a.roas)[0] ?? null;
  const worst = [...nonZero].sort((a, b) => a.roas - b.roas)[0] ?? null;

  const insights: string[] = [];
  if (best) insights.push(`${best.channel.replace("_", " ")} has highest ROI`);
  const fb = channelRows.find((c) => c.channel === "facebook_ads");
  if (fb && fb.cpa > 0 && fb.cpa > (channelRows.find((c) => c.channel === "google_ads")?.cpa ?? fb.cpa)) {
    insights.push("Facebook CPA too high");
  }
  const organic = channelRows.find((c) => c.channel === "organic_seo");
  if (organic && organic.bookings > 0) insights.push("Organic traffic growing");

  return NextResponse.json({
    range: days === 1 ? "today" : days === 30 ? "30d" : "7d",
    kpis: { totalAdSpend, totalBookingsFromAds, revenueFromAds, cpa, roas },
    channels: channelRows,
    funnel,
    funnelConversion: {
      visitToStartPct: funnel.visitors > 0 ? (funnel.started / funnel.visitors) * 100 : 0,
      startToPricePct: funnel.started > 0 ? (funnel.viewedPrice / funnel.started) * 100 : 0,
      priceToTimePct: funnel.viewedPrice > 0 ? (funnel.selectedTime / funnel.viewedPrice) * 100 : 0,
      timeToCompletePct: funnel.selectedTime > 0 ? (funnel.completed / funnel.selectedTime) * 100 : 0,
    },
    roi: {
      profit,
      bestChannel: best?.channel ?? null,
      worstChannel: worst?.channel ?? null,
    },
    charts: {
      revenueVsSpend: [...trend.entries()].map(([date, v]) => ({ date, ...v })),
      bookingsPerChannel: channelRows.map((c) => ({ channel: c.channel, bookings: c.bookings })),
    },
    insights,
  });
}

export async function POST(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { channel?: string; amount?: number; date?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const channel = String(body.channel ?? "") as Channel;
  const amount = Number(body.amount ?? 0);
  const date = String(body.date ?? "").slice(0, 10);
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const { error } = await admin.from("marketing_spend").insert({ channel, amount, date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
