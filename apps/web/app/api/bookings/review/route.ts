import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logReviewKpiEvent } from "@/lib/reviews/reviewKpiServer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function getUserIdFromBearer(request: Request): Promise<{ userId: string } | NextResponse> {
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

  return { userId: userData.user.id };
}

export async function POST(request: Request) {
  const auth = await getUserIdFromBearer(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: { bookingId?: string; rating?: number; comment?: string };
  try {
    body = (await request.json()) as { bookingId?: string; rating?: number; comment?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const rating = Math.round(Number(body.rating));
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";

  if (!bookingId || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "bookingId and rating 1–5 required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, user_id, cleaner_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String((booking as { user_id?: string }).user_id) !== userId) {
    return NextResponse.json({ error: "Not your booking." }, { status: 403 });
  }

  if (String((booking as { status?: string }).status ?? "").toLowerCase() !== "completed") {
    return NextResponse.json({ error: "You can only review completed bookings." }, { status: 400 });
  }

  const cleanerId = (booking as { cleaner_id?: string | null }).cleaner_id;
  if (!cleanerId) {
    return NextResponse.json({ error: "No cleaner on this booking." }, { status: 400 });
  }

  const { error: insErr } = await admin.from("reviews").insert({
    booking_id: bookingId,
    user_id: userId,
    cleaner_id: cleanerId,
    rating,
    comment: comment || null,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ error: "You already reviewed this booking." }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  logReviewKpiEvent("review_submitted", { booking_id: bookingId, rating, source: "api_post" });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await getUserIdFromBearer(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let body: { bookingId?: string; rating?: number; comment?: string | undefined };
  try {
    body = (await request.json()) as { bookingId?: string; rating?: number; comment?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required." }, { status: 400 });
  }

  const hasRating = body.rating !== undefined && body.rating !== null;
  const hasComment = body.comment !== undefined;
  if (!hasRating && !hasComment) {
    return NextResponse.json({ error: "Provide rating and/or comment to update." }, { status: 400 });
  }

  let nextRating: number | undefined;
  if (hasRating) {
    nextRating = Math.round(Number(body.rating));
    if (nextRating < 1 || nextRating > 5) {
      return NextResponse.json({ error: "rating must be 1–5." }, { status: 400 });
    }
  }

  let nextComment: string | null | undefined;
  if (hasComment) {
    nextComment =
      typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) || null : null;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: rev, error: rErr } = await admin
    .from("reviews")
    .select("id, created_at, user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (rErr || !rev) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  if (String((rev as { user_id?: string | null }).user_id) !== userId) {
    return NextResponse.json({ error: "Not your review." }, { status: 403 });
  }

  const createdAt = new Date(String((rev as { created_at: string }).created_at)).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: "Reviews can only be edited within 24 hours of submission." }, { status: 400 });
  }

  const patch: { rating?: number; comment?: string | null } = {};
  if (nextRating !== undefined) patch.rating = nextRating;
  if (hasComment) patch.comment = nextComment ?? null;

  const { error: upErr } = await admin.from("reviews").update(patch).eq("id", String((rev as { id: string }).id));

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
