import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { BOOKING_MIN_LEAD_MINUTES, billingMonthFromYmd, filterBookableTimeSlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESCHEDULE_STATUSES = new Set(["pending", "confirmed", "assigned"]);

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const nowSnapshot = new Date();

  let body: { date?: string; time?: string };
  try {
    body = (await request.json()) as { date?: string; time?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const timeRaw = typeof body.time === "string" ? body.time.trim() : "";
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  if (!isYmd(date) || !isHm(time)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and time (HH:MM) required." }, { status: 400 });
  }

  const todayJhb = johannesburgTodayYmd(nowSnapshot);
  if (date < todayJhb) {
    return NextResponse.json({ error: "Booking date cannot be in the past." }, { status: 400 });
  }
  const bookableSlots = filterBookableTimeSlots(date, { now: nowSnapshot, leadMinutes: BOOKING_MIN_LEAD_MINUTES });
  if (date === todayJhb && bookableSlots.length === 0) {
    return NextResponse.json(
      { error: "No bookable times remain today with the required notice. Please pick another date." },
      { status: 400 },
    );
  }
  if (!bookableSlots.includes(time)) {
    return NextResponse.json(
      {
        error: `Please choose a time at least ${BOOKING_MIN_LEAD_MINUTES / 60} hours from now (Johannesburg time).`,
      },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await admin
    .from("bookings")
    .select(
      "id, user_id, status, started_at, en_route_at, date, time, customer_email, service, cleaner_id, monthly_invoice_id, payment_status, is_monthly_billing_booking",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String((row as { user_id?: string }).user_id) !== userData.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const status = String((row as { status?: string }).status ?? "").toLowerCase();
  if (!RESCHEDULE_STATUSES.has(status)) {
    return NextResponse.json({ error: "This booking cannot be rescheduled." }, { status: 400 });
  }

  if ((row as { started_at?: string | null }).started_at || (row as { en_route_at?: string | null }).en_route_at) {
    return NextResponse.json({ error: "Cannot reschedule after the cleaner is on the way or started." }, { status: 400 });
  }

  const prevDate = String((row as { date?: string | null }).date ?? "");
  const prevTimeRaw = String((row as { time?: string | null }).time ?? "");
  const prevTime = prevTimeRaw.length >= 5 ? prevTimeRaw.slice(0, 5) : prevTimeRaw;

  const linkedMonthly = Boolean((row as { monthly_invoice_id?: string | null }).monthly_invoice_id);
  const pendingMonthly =
    String((row as { payment_status?: string | null }).payment_status ?? "").toLowerCase() === "pending_monthly";
  const monthlyFlag = Boolean((row as { is_monthly_billing_booking?: boolean | null }).is_monthly_billing_booking);
  const oldYm = billingMonthFromYmd(prevDate);
  const newYm = billingMonthFromYmd(date);
  if ((linkedMonthly || pendingMonthly || monthlyFlag) && oldYm && newYm && oldYm !== newYm) {
    return NextResponse.json(
      {
        error:
          "Cannot reschedule across calendar months for a monthly-billed visit. Contact support if the job must move to another billing month.",
      },
      { status: 409 },
    );
  }

  const { error: upErr } = await admin
    .from("bookings")
    .update({ date, time })
    .eq("id", bookingId)
    .eq("user_id", userData.user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const custEmail = String((row as { customer_email?: string | null }).customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "rescheduled",
    supabase: admin,
    bookingId,
    customerEmail: custEmail,
    previousDate: prevDate,
    previousTime: prevTime,
    newDate: date,
    newTime: time,
    serviceLabel: (row as { service?: string | null }).service ?? null,
  });

  const cleanerId = (row as { cleaner_id?: string | null }).cleaner_id;
  const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  if (status === "pending" && !cleanerId && autoDispatch) {
    void ensureBookingAssignment(admin, bookingId, { source: "customer_reschedule" });
  }

  return NextResponse.json({ ok: true });
}
