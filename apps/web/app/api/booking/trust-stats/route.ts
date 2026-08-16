import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUST_STATS_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";
const ROLLUP_FALLBACK_TODAY_LIMIT = 1_000;
const ROLLUP_FALLBACK_WEEK_LIMIT = 5_000;

type BookingTrustRow = {
  status?: string | null;
  payment_status?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
};

type BookingTrustRollup = {
  bookings_today: number | string | null;
  bookings_this_week: number | string | null;
  completed_this_week: number | string | null;
};

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function paidOrOperational(row: BookingTrustRow): boolean {
  const status = String(row.status ?? "").toLowerCase();
  const paymentStatus = String(row.payment_status ?? "").toLowerCase();
  const paidZar = typeof row.total_paid_zar === "number" ? row.total_paid_zar : 0;
  const paidCents = typeof row.amount_paid_cents === "number" ? row.amount_paid_cents : 0;
  return paidZar > 0 || paidCents > 0 || status === "paid" || paymentStatus === "paid" || paymentStatus === "success";
}

function safeCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isMissingRollupRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .*booking_trust_stats_rollup.* does not exist/i.test(error.message ?? "");
}

function trustStatsResponse(payload: {
  bookingsToday: number;
  bookingsThisWeek: number;
  completedThisWeek: number;
  avgRating: number;
  reviewCount: number;
}) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": TRUST_STATS_CACHE_CONTROL },
  });
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return trustStatsResponse({
      bookingsToday: 0,
      bookingsThisWeek: 0,
      completedThisWeek: 0,
      avgRating: GOOGLE_BUSINESS_REVIEWS.rating,
      reviewCount: GOOGLE_BUSINESS_REVIEWS.count,
    });
  }

  const todayIso = startOfTodayIso();
  const weekIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rollupRes = await admin.rpc("booking_trust_stats_rollup", {
    p_today_since: todayIso,
    p_week_since: weekIso,
  });

  if (!rollupRes.error) {
    const rollup = (rollupRes.data?.[0] ?? null) as BookingTrustRollup | null;
    return trustStatsResponse({
      bookingsToday: safeCount(rollup?.bookings_today),
      bookingsThisWeek: safeCount(rollup?.bookings_this_week),
      completedThisWeek: safeCount(rollup?.completed_this_week),
      avgRating: GOOGLE_BUSINESS_REVIEWS.rating,
      reviewCount: GOOGLE_BUSINESS_REVIEWS.count,
    });
  }

  // Additive migration rollout safety only: retain the old reads while PostgREST has not seen the RPC yet.
  // Operational RPC failures must not amplify database load by switching to the oversized legacy path.
  if (!isMissingRollupRpcError(rollupRes.error)) {
    return NextResponse.json({ error: "Trust stats temporarily unavailable." }, { status: 503 });
  }

  const [todayRes, weekRes] = await Promise.all([
    admin
      .from("bookings")
      .select("status, payment_status, total_paid_zar, amount_paid_cents")
      .gte("created_at", todayIso)
      .limit(ROLLUP_FALLBACK_TODAY_LIMIT),
    admin
      .from("bookings")
      .select("status, payment_status, total_paid_zar, amount_paid_cents")
      .gte("created_at", weekIso)
      .limit(ROLLUP_FALLBACK_WEEK_LIMIT),
  ]);

  const today = (todayRes.error ? [] : (todayRes.data ?? [])) as BookingTrustRow[];
  const week = (weekRes.error ? [] : (weekRes.data ?? [])) as BookingTrustRow[];

  return trustStatsResponse({
    bookingsToday: today.filter(paidOrOperational).length,
    bookingsThisWeek: week.filter(paidOrOperational).length,
    completedThisWeek: week.filter((b) => String(b.status ?? "").toLowerCase() === "completed").length,
    avgRating: GOOGLE_BUSINESS_REVIEWS.rating,
    reviewCount: GOOGLE_BUSINESS_REVIEWS.count,
  });
}
