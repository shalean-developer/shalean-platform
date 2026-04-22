import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { isBookingTimeInWindow } from "@/lib/dispatch/timeWindow";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
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
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { cleanerId?: string; force?: boolean };
  try {
    body = (await request.json()) as { cleanerId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const rawCleanerId = typeof body.cleanerId === "string" ? body.cleanerId.trim() : "";
  if (!rawCleanerId) {
    return NextResponse.json({ error: "cleanerId required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, status, cleaner_id, city_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const st = String((booking as { status?: string }).status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") {
    return NextResponse.json({ error: "Booking cannot be assigned in this state." }, { status: 400 });
  }

  const dateYmd = String((booking as { date?: string }).date ?? "");
  const timeHm = String((booking as { time?: string }).time ?? "");
  const force = body.force === true;

  /** Always use `cleaners.id` for FKs; body may mistakenly send `auth.users` id. */
  const { data: cleaner, error: cErr } = await admin
    .from("cleaners")
    .select("id, status, city_id")
    .or(`id.eq.${rawCleanerId},auth_user_id.eq.${rawCleanerId}`)
    .maybeSingle();

  if (cErr || !cleaner) {
    return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
  }

  const cleanerId = String((cleaner as { id: string }).id);

  if (process.env.NODE_ENV !== "production") {
    console.log("[admin/assign] resolved cleaner", {
      bookingId,
      rawCleanerId,
      cleanerId,
      matchedBySurrogate: rawCleanerId === cleanerId,
    });
  }

  if (!force && dateYmd && timeHm) {
    const { data: windows } = await admin
      .from("cleaner_availability")
      .select("start_time, end_time, is_available")
      .eq("cleaner_id", cleanerId)
      .eq("date", dateYmd)
      .eq("is_available", true);

    let ok = false;
    for (const w of windows ?? []) {
      if (
        w &&
        typeof w === "object" &&
        "start_time" in w &&
        "end_time" in w &&
        isBookingTimeInWindow(timeHm, String((w as { start_time: string }).start_time), String((w as { end_time: string }).end_time))
      ) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      return NextResponse.json(
        { error: "Cleaner has no availability for this slot. Pass force=true to override." },
        { status: 400 },
      );
    }
  }

  const prevCleaner = (booking as { cleaner_id?: string | null }).cleaner_id;

  const cleanerStatus = String((cleaner as { status?: string | null }).status ?? "").toLowerCase();
  const bookingCityId = String((booking as { city_id?: string | null }).city_id ?? "");
  const cleanerCityId = String((cleaner as { city_id?: string | null }).city_id ?? "");
  if (bookingCityId && cleanerCityId && bookingCityId !== cleanerCityId) {
    return NextResponse.json({ error: "Cleaner is in a different city." }, { status: 400 });
  }
  if (!force && cleanerStatus === "offline") {
    return NextResponse.json({ error: "Cleaner is not available." }, { status: 400 });
  }

  const { error: uErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: null,
      status: "pending",
      dispatch_status: "offered",
      assigned_at: null,
    })
    .eq("id", bookingId);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  const offer = await createDispatchOfferRow({
    supabase: admin,
    bookingId,
    cleanerId,
    rankIndex: 0,
    ttlSeconds: 60,
  });
  if (!offer.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[admin/assign] createDispatchOfferRow failed", { bookingId, cleanerId, error: offer.error });
    }
    return NextResponse.json({ error: offer.error || "Could not create offer." }, { status: 500 });
  }

  if (prevCleaner && prevCleaner !== cleanerId) {
    await syncCleanerBusyFromBookings(admin, prevCleaner);
  }

  return NextResponse.json({ ok: true, cleanerId, offerId: offer.offerId, expiresAt: offer.expiresAtIso });
}
