import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildCustomerBookingTrackDto } from "@/lib/customer/customerBookingTrack";
import { loadCustomerBookingRowForUser } from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer live-tracking DTO for mobile / API clients.
 * Ownership: same as `GET /api/customer/bookings/[id]` (404 when denied).
 * Privacy: cleaner coordinates only when phase is travelling/active.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const bookingId = id.trim();
  const out = await loadCustomerBookingRowForUser(admin, userData.user.id, bookingId, {
    viewerEmail: typeof userData.user.email === "string" ? userData.user.email : null,
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }

  const trackableHint = buildCustomerBookingTrackDto(out.booking, null).trackable;
  let rawPoint: unknown = null;
  if (trackableHint) {
    const { data: last, error: pointErr } = await admin
      .from("cleaner_booking_track_points")
      .select("lat, lng, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pointErr) {
      return NextResponse.json({ error: "Could not load tracking." }, { status: 500 });
    }
    rawPoint = last;
  }

  const track = buildCustomerBookingTrackDto(out.booking, rawPoint);
  return NextResponse.json({ track });
}
