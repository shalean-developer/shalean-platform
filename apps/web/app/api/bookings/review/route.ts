import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  if (String((booking as { user_id?: string }).user_id) !== userData.user.id) {
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
    user_id: userData.user.id,
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

  return NextResponse.json({ ok: true });
}
