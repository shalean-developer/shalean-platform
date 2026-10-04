import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { loadCustomerReviewsForUser } from "@/lib/customer/loadCustomerReviewsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer reviews list with cleaner name + booking context (no PostgREST embed). */
export async function GET(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const out = await loadCustomerReviewsForUser(admin, auth.session.userId);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }

  return NextResponse.json({ ok: true, reviews: out.reviews });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_ID_LOOKUP_MAX = 100;

/** Bounded eligibility lookup backed by the unique reviews.booking_id index. */
export async function POST(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { bookingIds?: unknown } | null;
  const bookingIds = Array.isArray(body?.bookingIds)
    ? Array.from(new Set(body.bookingIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))))
    : [];
  if (!Array.isArray(body?.bookingIds) || bookingIds.length !== body.bookingIds.length || bookingIds.length > REVIEW_ID_LOOKUP_MAX) {
    return NextResponse.json({ error: "Invalid booking IDs." }, { status: 400 });
  }
  if (bookingIds.length === 0) return NextResponse.json({ ok: true, reviewedBookingIds: [] });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin
    .from("reviews")
    .select("booking_id")
    .eq("user_id", auth.session.userId)
    .in("booking_id", bookingIds)
    .limit(REVIEW_ID_LOOKUP_MAX);
  if (error) return NextResponse.json({ error: "Could not verify reviewed bookings." }, { status: 500 });
  return NextResponse.json({
    ok: true,
    reviewedBookingIds: (data ?? []).map((row) => String((row as { booking_id: string }).booking_id)),
  });
}
