import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingTrustRow = {
  status?: string | null;
  payment_status?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
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

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({
      bookingsToday: 0,
      bookingsThisWeek: 0,
      completedThisWeek: 0,
      avgRating: GOOGLE_BUSINESS_REVIEWS.rating,
      reviewCount: GOOGLE_BUSINESS_REVIEWS.count,
    });
  }

  const todayIso = startOfTodayIso();
  const weekIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [todayRes, weekRes] = await Promise.all([
    admin
      .from("bookings")
      .select("status, payment_status, total_paid_zar, amount_paid_cents")
      .gte("created_at", todayIso)
      .limit(1000),
    admin
      .from("bookings")
      .select("status, payment_status, total_paid_zar, amount_paid_cents")
      .gte("created_at", weekIso)
      .limit(5000),
  ]);

  const today = (todayRes.error ? [] : (todayRes.data ?? [])) as BookingTrustRow[];
  const week = (weekRes.error ? [] : (weekRes.data ?? [])) as BookingTrustRow[];

  return NextResponse.json({
    bookingsToday: today.filter(paidOrOperational).length,
    bookingsThisWeek: week.filter(paidOrOperational).length,
    completedThisWeek: week.filter((b) => String(b.status ?? "").toLowerCase() === "completed").length,
    avgRating: GOOGLE_BUSINESS_REVIEWS.rating,
    reviewCount: GOOGLE_BUSINESS_REVIEWS.count,
  });
}
