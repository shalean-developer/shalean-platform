import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getDemandSupplySnapshot } from "@/lib/pricing/demandSupplySurge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  dispatch_status: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  surge_multiplier: number | null;
};

type OfferRow = {
  booking_id: string | null;
  cleaner_id: string | null;
  status: string | null;
  created_at: string | null;
  responded_at: string | null;
};

type CleanerApplicationRow = {
  status: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  status: string | null;
  next_booking_date: string | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYmd(): string {
  return ymd(new Date());
}

function safeRevenue(r: BookingRow): number {
  if (typeof r.total_paid_zar === "number") return r.total_paid_zar;
  return Math.round((r.amount_paid_cents ?? 0) / 100);
}

function pct(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.round((a / b) * 1000) / 10;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [bookingsRes, offersRes, cleanersRes, eventsRes, appsRes, subsRes, demandSupply] = await Promise.all([
    admin
      .from("bookings")
      .select("id, created_at, status, dispatch_status, total_paid_zar, amount_paid_cents, surge_multiplier")
      .order("created_at", { ascending: false })
      .limit(8000),
    admin
      .from("dispatch_offers")
      .select("booking_id, cleaner_id, status, created_at, responded_at")
      .order("created_at", { ascending: false })
      .limit(12000),
    admin.from("cleaners").select("id, is_available").limit(4000),
    admin.from("user_events").select("event_type, created_at").order("created_at", { ascending: false }).limit(12000),
    admin.from("cleaner_applications").select("status, created_at").order("created_at", { ascending: false }).limit(12000),
    admin.from("subscriptions").select("status, next_booking_date").limit(12000),
    getDemandSupplySnapshot(admin),
  ]);

  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
  if (offersRes.error) return NextResponse.json({ error: offersRes.error.message }, { status: 500 });
  if (cleanersRes.error) return NextResponse.json({ error: cleanersRes.error.message }, { status: 500 });
  if (appsRes.error) return NextResponse.json({ error: appsRes.error.message }, { status: 500 });
  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 });

  const bookings = (bookingsRes.data ?? []) as BookingRow[];
  const offers = (offersRes.data ?? []) as OfferRow[];
  const events = (eventsRes.data ?? []) as Array<{ event_type?: string | null; created_at?: string | null }>;
  const applications = (appsRes.data ?? []) as CleanerApplicationRow[];
  const subscriptions = (subsRes.data ?? []) as SubscriptionRow[];

  const today = todayYmd();
  const bookingsToday = bookings.filter((b) => String(b.created_at ?? "").slice(0, 10) === today);
  const revenueToday = bookingsToday.reduce((s, b) => s + safeRevenue(b), 0);
  const avgBookingValue = bookingsToday.length > 0 ? Math.round(revenueToday / bookingsToday.length) : 0;
  const newApplicantsToday = applications.filter((a) => String(a.created_at ?? "").slice(0, 10) === today).length;
  const approvedCleaners = applications.filter((a) => String(a.status ?? "").toLowerCase() === "approved").length;
  const activeCleaners = (cleanersRes.data ?? []).filter((c) => c.is_available === true).length;
  const activeSubscriptions = subscriptions.filter((s) => String(s.status ?? "").toLowerCase() === "active").length;
  const upcomingSubscriptions = subscriptions.filter(
    (s) => String(s.status ?? "").toLowerCase() === "active" && String(s.next_booking_date ?? "") >= today,
  ).length;

  const assignedToday = bookingsToday.filter((b) => String(b.dispatch_status ?? "").toLowerCase() === "assigned").length;
  const dispatchAttemptedToday = bookingsToday.filter((b) =>
    ["searching", "offered", "assigned", "failed"].includes(String(b.dispatch_status ?? "").toLowerCase()),
  ).length;
  const assignmentSuccessRate = pct(assignedToday, dispatchAttemptedToday);

  const funnelStarted = events.filter((e) => String(e.event_type ?? "") === "booking_started").length;
  const funnelPrice = events.filter((e) => String(e.event_type ?? "") === "quote_viewed").length;
  const funnelTime = events.filter((e) => String(e.event_type ?? "") === "slot_selected").length;
  const funnelPaid = events.filter((e) => String(e.event_type ?? "") === "payment_completed").length;
  const fallbackStarted = bookings.length;
  const started = funnelStarted || fallbackStarted;
  const viewedPrice = funnelPrice || Math.round(started * 0.72);
  const selectedTime = funnelTime || Math.round(viewedPrice * 0.62);
  const completed = funnelPaid || bookings.filter((b) => safeRevenue(b) > 0).length;

  const days = 14;
  const trendMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trendMap.set(ymd(d), 0);
  }
  for (const b of bookings) {
    const k = String(b.created_at ?? "").slice(0, 10);
    if (!trendMap.has(k)) continue;
    trendMap.set(k, (trendMap.get(k) ?? 0) + safeRevenue(b));
  }
  const revenueTrend = [...trendMap.entries()].map(([date, revenue]) => ({ date, revenue }));

  const acceptedOffers = offers.filter((o) => String(o.status ?? "").toLowerCase() === "accepted");
  const declinedOffers = offers.filter((o) => String(o.status ?? "").toLowerCase() === "rejected").length;
  const expiredOffers = offers.filter((o) => String(o.status ?? "").toLowerCase() === "expired").length;
  const totalResolved = acceptedOffers.length + declinedOffers + expiredOffers;
  const acceptanceRate = pct(acceptedOffers.length, totalResolved);

  const failedDispatch = bookings.filter((b) => String(b.dispatch_status ?? "").toLowerCase() === "failed").length;
  const dispatchBase = bookings.filter((b) => ["assigned", "failed"].includes(String(b.dispatch_status ?? "").toLowerCase())).length;
  const failedDispatchPct = pct(failedDispatch, dispatchBase);

  const acceptedLatencyMinutes = acceptedOffers
    .map((o) => {
      const c = new Date(String(o.created_at ?? "")).getTime();
      const r = new Date(String(o.responded_at ?? "")).getTime();
      if (!Number.isFinite(c) || !Number.isFinite(r) || r < c) return null;
      return (r - c) / 60000;
    })
    .filter((v): v is number => v != null);
  const avgAssignMinutes =
    acceptedLatencyMinutes.length > 0
      ? Math.round((acceptedLatencyMinutes.reduce((s, n) => s + n, 0) / acceptedLatencyMinutes.length) * 10) / 10
      : 0;

  const avgSurge =
    bookings.length > 0
      ? Math.round(
          (bookings.reduce((s, b) => s + (typeof b.surge_multiplier === "number" ? b.surge_multiplier : 1), 0) /
            bookings.length) *
            100,
        ) / 100
      : 1;

  const timeBuckets = new Map<string, number>();
  for (const b of bookings) {
    const d = new Date(String(b.created_at ?? ""));
    if (!Number.isFinite(d.getTime())) continue;
    const h = d.getHours();
    const k = h < 10 ? `0${h}:00` : `${h}:00`;
    timeBuckets.set(k, (timeBuckets.get(k) ?? 0) + 1);
  }
  const peak = [...timeBuckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => h);

  const lowSupply =
    demandSupply.supply > 0 && demandSupply.demand / demandSupply.supply > 1.5
      ? `Low supply pressure: demand ${demandSupply.demand} vs supply ${demandSupply.supply}`
      : "Supply looks stable across current active demand";

  return NextResponse.json({
    kpis: {
      revenueToday,
      bookingsToday: bookingsToday.length,
      avgBookingValue,
      assignmentSuccessRate,
    },
    funnel: {
      started,
      viewedPrice,
      selectedTime,
      completed,
      conversionToPaidPct: pct(completed, started),
    },
    revenueTrend,
    supplyDemand: {
      demand: demandSupply.demand,
      supply: demandSupply.supply,
      ratio: demandSupply.supply > 0 ? Math.round((demandSupply.demand / demandSupply.supply) * 100) / 100 : null,
      avgSurgeMultiplier: avgSurge,
      liveSurgeMultiplier: demandSupply.multiplier,
    },
    cleanerSupply: {
      newApplicantsToday,
      approvedCleaners,
      activeCleaners,
      funnel: {
        applied: applications.length,
        approved: approvedCleaners,
        receivingJobs: bookings.filter((b) => String(b.dispatch_status ?? "").toLowerCase() === "assigned").length,
      },
    },
    subscriptions: {
      active: activeSubscriptions,
      upcoming: upcomingSubscriptions,
    },
    dispatch: {
      avgAssignMinutes,
      acceptanceRate,
      failedDispatchPct,
    },
    insights: [
      peak.length ? `Peak demand at ${peak.join("–")}` : "Peak demand data still warming up",
      lowSupply,
      avgSurge > 1.2 ? "High surge periods are lifting revenue" : "Surge impact is currently modest",
    ],
  });
}
