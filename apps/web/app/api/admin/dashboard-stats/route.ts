import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingMini = {
  created_at: string | null;
  date: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
};

type EventRow = { session_id: string; step: string; event_type: string };

function zar(b: BookingMini): number {
  if (typeof b.total_paid_zar === "number") return b.total_paid_zar;
  return Math.round((b.amount_paid_cents ?? 0) / 100);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [bookingsRes, eventsRes] = await Promise.all([
    admin
      .from("bookings")
      .select("created_at, date, total_paid_zar, amount_paid_cents")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(12000),
    admin
      .from("booking_events")
      .select("session_id, step, event_type")
      .gte("created_at", since.toISOString())
      .limit(25000),
  ]);

  if (bookingsRes.error) {
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
  }

  const bookings = (bookingsRes.data ?? []) as BookingMini[];
  const events = (eventsRes.error ? [] : (eventsRes.data ?? [])) as EventRow[];

  const today = todayYmdJohannesburg();
  const monthStart = monthStartYmd();

  let revenueToday = 0;
  let revenueMonth = 0;
  let paidBookingsToday = 0;
  let paidBookingsMonth = 0;

  const revenueByDay = new Map<string, number>();
  const bookingsByDay = new Map<string, number>();

  for (const b of bookings) {
    const z = zar(b);
    const created = String(b.created_at ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) continue;

    bookingsByDay.set(created, (bookingsByDay.get(created) ?? 0) + 1);

    if (z <= 0) continue;

    revenueByDay.set(created, (revenueByDay.get(created) ?? 0) + z);

    if (created === today) {
      revenueToday += z;
      paidBookingsToday++;
    }
    if (created >= monthStart) {
      revenueMonth += z;
      paidBookingsMonth++;
    }
  }

  const totalPaidBookings = bookings.filter((b) => zar(b) > 0).length;
  const avgBookingValue =
    totalPaidBookings > 0
      ? Math.round(bookings.reduce((s, b) => s + zar(b), 0) / Math.max(1, totalPaidBookings))
      : 0;

  const quoteViews = new Set<string>();
  const paymentReached = new Set<string>();
  for (const e of events) {
    if (e.event_type === "view" && e.step === "quote") quoteViews.add(e.session_id);
    if ((e.event_type === "view" || e.event_type === "next") && e.step === "payment") {
      paymentReached.add(e.session_id);
    }
  }
  const funnelStart = Math.max(quoteViews.size, 1);
  const conversionRatePct = Math.round((paymentReached.size / funnelStart) * 1000) / 10;

  const days = 30;
  const revenueSeries: { date: string; revenue: number }[] = [];
  const bookingSeries: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    revenueSeries.push({ date: key, revenue: revenueByDay.get(key) ?? 0 });
    bookingSeries.push({ date: key, count: bookingsByDay.get(key) ?? 0 });
  }

  return NextResponse.json({
    revenueTodayZar: revenueToday,
    revenueMonthZar: revenueMonth,
    paidBookingsToday,
    paidBookingsMonth,
    totalBookingsWindow: bookings.length,
    avgBookingValueZar: avgBookingValue,
    conversionRatePct,
    funnelSessionsQuote: quoteViews.size,
    funnelSessionsPayment: paymentReached.size,
    revenueByDay: revenueSeries,
    bookingsByDay: bookingSeries,
  });
}
