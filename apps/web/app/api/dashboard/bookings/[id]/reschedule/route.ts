import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { BOOKING_MIN_LEAD_MINUTES, billingMonthFromYmd, filterBookableTimeSlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import {
  CUSTOMER_RESCHEDULE_REDISPATCH_STATUSES,
  isCustomerReschedulableBookingStatus,
} from "@/lib/dashboard/customerBookingModifyStatuses";
import {
  loadCustomerBookingRowForUser,
  resolveBookingOwnershipColumn,
} from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const userId = userData.user.id;
  const viewerEmail = userData.user.email ?? null;
  const load = await loadCustomerBookingRowForUser(admin, userId, bookingId, { viewerEmail });
  if (!load.ok) {
    return NextResponse.json({ error: load.error }, { status: load.status });
  }

  const row = load.booking;
  const status = String(row.status ?? "").toLowerCase();
  if (!isCustomerReschedulableBookingStatus(status)) {
    return NextResponse.json({ error: "This booking cannot be rescheduled." }, { status: 400 });
  }

  if (row.started_at || row.en_route_at) {
    return NextResponse.json({ error: "Cannot reschedule after the cleaner is on the way or started." }, { status: 400 });
  }

  const prevDate = String(row.date ?? "");
  const prevTimeRaw = String(row.time ?? "");
  const prevTime = prevTimeRaw.length >= 5 ? prevTimeRaw.slice(0, 5) : prevTimeRaw;

  const linkedMonthly = Boolean(row.monthly_invoice_id);
  const pendingMonthly = String(row.payment_status ?? "").toLowerCase() === "pending_monthly";
  const monthlyFlag = Boolean(row.is_monthly_billing_booking);
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

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { error: upErr } = await admin
    .from("bookings")
    .update({ date, time })
    .eq("id", bookingId)
    .eq(ownershipColumn, userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const custEmail = String(row.customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "rescheduled",
    supabase: admin,
    bookingId,
    customerEmail: custEmail,
    previousDate: prevDate,
    previousTime: prevTime,
    newDate: date,
    newTime: time,
    serviceLabel: row.service ?? null,
  });

  const cleanerId = row.cleaner_id;
  const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  if (CUSTOMER_RESCHEDULE_REDISPATCH_STATUSES.has(status) && !cleanerId && autoDispatch) {
    void ensureBookingAssignment(admin, bookingId, { source: "customer_reschedule" });
  }

  return NextResponse.json({ ok: true });
}
