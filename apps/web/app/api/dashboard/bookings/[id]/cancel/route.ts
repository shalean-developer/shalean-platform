import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyCustomerBookingCancelled } from "@/lib/notifications/customerUserNotifications";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { logSystemEvent } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCELLABLE = new Set(["pending", "confirmed", "assigned"]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
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

  const { data: row, error: fetchErr } = await admin
    .from("bookings")
    .select("id, user_id, status, started_at, service, date, time, customer_email")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String((row as { user_id?: string }).user_id) !== userData.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const status = String((row as { status?: string }).status ?? "").toLowerCase();
  if (!CANCELLABLE.has(status)) {
    return NextResponse.json({ error: "This booking cannot be cancelled." }, { status: 400 });
  }

  if ((row as { started_at?: string | null }).started_at) {
    return NextResponse.json({ error: "Cannot cancel after the clean has started." }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cleaner_payout_cents: 0,
      cleaner_bonus_cents: 0,
      company_revenue_cents: 0,
      payout_percentage: null,
      payout_type: "cancelled_zero",
    })
    .eq("id", bookingId)
    .eq("user_id", userData.user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await admin
    .from("booking_lifecycle_jobs")
    .update({ status: "cancelled", last_error: null })
    .eq("booking_id", bookingId)
    .is("sent_at", null);

  void logSystemEvent({
    level: "info",
    source: "customer_booking_cancel",
    message: "Cancelled booking payout set to zero",
    context: { bookingId },
  });

  const custEmail = String((row as { customer_email?: string | null }).customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "cancelled",
    supabase: admin,
    bookingId,
    customerEmail: custEmail,
    serviceLabel: (row as { service?: string | null }).service ?? null,
    dateYmd: (row as { date?: string | null }).date ?? null,
    timeHm: (row as { time?: string | null }).time ?? null,
  });

  const uid = String((row as { user_id?: string }).user_id ?? "");
  if (uid) {
    void notifyCustomerBookingCancelled(admin, {
      bookingId,
      userId: uid,
      serviceLabel: (row as { service?: string | null }).service ?? null,
      dateYmd: (row as { date?: string | null }).date ?? null,
      timeHm: (row as { time?: string | null }).time ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
