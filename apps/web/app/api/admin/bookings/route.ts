import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { fetchSlaDispatchLastActions } from "@/lib/admin/slaDispatchLastAction";
import {
  getDispatchSlaBreachMinutes,
  rowMatchesAttentionFilter,
  slaBreachOverdueMinutes,
  sortRowsForAttentionQueue,
  type OpsSnapshotRow,
} from "@/lib/admin/opsSnapshot";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import type { AdminClientPaymentStatus } from "@/lib/booking/adminPaymentLinkState";
import { deriveAdminClientPaymentStatus } from "@/lib/booking/adminPaymentLinkState";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { aggregatePaymentLinkDeliveryStats } from "@/lib/pay/paymentLinkDeliveryStats";
import { getDemandSupplySnapshotByCity } from "@/lib/pricing/demandSupplySurge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  company_revenue_cents: number | null;
  payout_percentage: number | null;
  payout_type: string | null;
  is_test: boolean | null;
  status: string | null;
  dispatch_status: string | null;
  surge_multiplier: number | null;
  surge_reason: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  assignment_type: string | null;
  fallback_reason: string | null;
  attempted_cleaner_id: string | null;
  became_pending_at: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
  city_id: string | null;
  duration_minutes: number | null;
  dispatch_attempt_count: number | null;
  created_by_admin: boolean | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  payment_link_last_sent_at: string | null;
  payment_link_delivery: Record<string, unknown> | null;
  payment_link_reminder_1h_sent_at: string | null;
  payment_link_reminder_15m_sent_at: string | null;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_needs_follow_up: boolean | null;
  payment_completed_at: string | null;
  payment_conversion_seconds: number | null;
  payment_conversion_bucket: string | null;
  conversion_channel: string | null;
  payment_first_touch_channel: string | null;
  payment_last_touch_channel: string | null;
  payment_assist_channels: unknown;
  booking_priority: string | null;
  last_decision_snapshot: unknown;
};

type RowWithPaymentStatus = Row & { payment_status: AdminClientPaymentStatus };

function toOpsSnapshotRow(r: Row): OpsSnapshotRow {
  return {
    id: r.id,
    status: r.status,
    date: r.date,
    time: r.time,
    cleaner_id: r.cleaner_id,
    dispatch_status: r.dispatch_status,
    became_pending_at: r.became_pending_at,
    created_at: r.created_at,
    total_paid_zar: r.total_paid_zar,
    amount_paid_cents: r.amount_paid_cents,
  };
}

function classifyBooking(row: Row, today: string): "today" | "upcoming" | "completed" {
  const st = row.status?.toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed" || st === "payment_expired") return "completed";
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
  const cityId = searchParams.get("cityId");
  const bookingStatus = searchParams.get("bookingStatus");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const bookingSelect =
    "id, customer_name, customer_email, service, date, time, location, total_paid_zar, amount_paid_cents, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, payout_percentage, payout_type, is_test, status, dispatch_status, surge_multiplier, surge_reason, user_id, cleaner_id, selected_cleaner_id, assignment_type, fallback_reason, attempted_cleaner_id, became_pending_at, assigned_at, en_route_at, started_at, completed_at, created_at, paystack_reference, city_id, duration_minutes, dispatch_attempt_count, created_by_admin, payment_link, payment_link_expires_at, payment_link_last_sent_at, payment_link_delivery, payment_link_reminder_1h_sent_at, payment_link_reminder_15m_sent_at, payment_link_send_count, payment_link_first_sent_at, payment_needs_follow_up, payment_completed_at, payment_conversion_seconds, payment_conversion_bucket, conversion_channel, payment_first_touch_channel, payment_last_touch_channel, payment_assist_channels, booking_priority, last_decision_snapshot";

  let bookingQuery = admin.from("bookings").select(bookingSelect);

  if (filter === "follow-up") {
    bookingQuery = bookingQuery
      .eq("payment_needs_follow_up", true)
      .order("payment_conversion_seconds", { ascending: false, nullsFirst: false })
      .order("payment_link_send_count", { ascending: false })
      .limit(2000);
  } else {
    bookingQuery = bookingQuery.order("created_at", { ascending: false }).limit(4000);
  }
  if (cityId) bookingQuery = bookingQuery.eq("city_id", cityId);
  if (bookingStatus && bookingStatus !== "all") {
    bookingQuery = bookingQuery.eq("status", bookingStatus);
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    bookingQuery = bookingQuery.gte("date", from);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    bookingQuery = bookingQuery.lte("date", to);
  }
  const { data: rawRows, error: selErr } = await bookingQuery;

  if (selErr) {
    await reportOperationalIssue("error", "api/admin/bookings", selErr.message);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  const rows = (rawRows ?? []) as Row[];
  const today = todayYmdJohannesburg();

  let filtered = rows;
  if (filter === "follow-up") {
    filtered = rows;
  } else if (filter === "today") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "today");
  } else if (filter === "upcoming") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "upcoming");
  } else if (filter === "completed") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "completed");
  } else if (filter === "sla") {
    const slaM = getDispatchSlaBreachMinutes();
    const nowMs = Date.now();
    const breachRows = rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "sla", nowMs, slaM));
    const enriched = breachRows.map((r) => {
      const op = toOpsSnapshotRow(r);
      return {
        ...r,
        slaBreachMinutes: slaBreachOverdueMinutes(op, nowMs, slaM) ?? 0,
      };
    });
    const sorted = sortRowsForAttentionQueue(enriched, "sla", nowMs, slaM);
    const actions = await fetchSlaDispatchLastActions(admin, sorted.map((r) => r.id));
    filtered = sorted.map((r) => {
      const act = actions.get(r.id);
      return {
        ...r,
        dispatchLastAction: act?.displayText ?? "—",
        lastActionMinutesAgo: act?.lastActionMinutesAgo ?? null,
      };
    });
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
  const demandSupply = await getDemandSupplySnapshotByCity(admin, cityId || null);
  const { data: cityRows } = await admin.from("cities").select("id, name, is_active").order("name", { ascending: true });
  const vipDistribution = { regular: 0, silver: 0, gold: 0, platinum: 0 };
  for (const p of profileRows ?? []) {
    const t = typeof p === "object" && p && "tier" in p ? String((p as { tier?: string }).tier ?? "regular") : "regular";
    if (t === "silver") vipDistribution.silver++;
    else if (t === "gold") vipDistribution.gold++;
    else if (t === "platinum") vipDistribution.platinum++;
    else vipDistribution.regular++;
  }

  const withPaymentStatus: RowWithPaymentStatus[] = filtered.map((r) => ({
    ...r,
    payment_status: deriveAdminClientPaymentStatus(r),
  }));

  const paymentLinkChannelStats = aggregatePaymentLinkDeliveryStats(rows);

  return NextResponse.json({
    bookings: withPaymentStatus,
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
      demandOpenBookings: demandSupply.demand,
      supplyAvailableCleaners: demandSupply.supply,
      liveSurgeMultiplier: demandSupply.multiplier,
      slaBreachMinutes: getDispatchSlaBreachMinutes(),
      paymentLinkChannelStats,
    },
    failedJobs: failedJobs ?? [],
    cities: cityRows ?? [],
    selectedCityId: cityId || null,
  });
}
