import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { aggregateMarketingData } from "@/lib/admin/marketingAggregation";
import { MARKETING_CHANNELS, type MarketingChannel } from "@/lib/admin/marketingAttribution";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (userErr || !user?.id) return { ok: false, status: 401, error: "Invalid or expired session." };
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) return { ok: false, status: adminAuth.status, error: adminAuth.error };
  return { ok: true };
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

  const summary = aggregateMarketingData({
    events,
    spendRows: spendRes.data ?? [],
    bookingRevenue,
    days,
    since,
  });

  return NextResponse.json(summary);
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

  const channel = String(body.channel ?? "") as MarketingChannel;
  const amount = Number(body.amount ?? 0);
  const date = String(body.date ?? "").slice(0, 10);
  if (!MARKETING_CHANNELS.includes(channel)) return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const { error } = await admin.from("marketing_spend").insert({ channel, amount, date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
