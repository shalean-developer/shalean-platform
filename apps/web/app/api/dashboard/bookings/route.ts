import crypto from "crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { BOOKING_MIN_LEAD_MINUTES, filterBookableTimeSlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

/**
 * Self-service booking for **monthly-billed** customers only: inserts a real `bookings` row with
 * `user_id` set; DB triggers attach to `monthly_invoices` and set `pending_monthly`. No Paystack.
 */
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

  const nowSnapshot = new Date();
  const userId = userData.user.id;
  const userEmail = typeof userData.user.email === "string" ? userData.user.email.trim().toLowerCase() : "";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const timeRaw = typeof body.time === "string" ? body.time.trim() : "";
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  const serviceRaw = typeof body.service === "string" ? body.service.trim().toLowerCase() : "";
  const SERVICE_IDS = new Set<string>(["quick", "standard", "airbnb", "deep", "carpet", "move"]);
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
  const totalPaidZar =
    typeof body.totalPaidZar === "number" && Number.isFinite(body.totalPaidZar)
      ? Math.max(0, Math.round(body.totalPaidZar))
      : null;

  if (!isYmd(date) || !isHm(time)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and time (HH:MM) are required." }, { status: 400 });
  }

  const todayJhb = johannesburgTodayYmd(nowSnapshot);
  if (date < todayJhb) {
    return NextResponse.json({ error: "Booking date cannot be in the past." }, { status: 400 });
  }
  const bookableSlots = filterBookableTimeSlots(date, { now: nowSnapshot, leadMinutes: BOOKING_MIN_LEAD_MINUTES });
  if (date === todayJhb && bookableSlots.length === 0) {
    return NextResponse.json(
      {
        error:
          "No bookable times remain today with the required notice. Please pick tomorrow or a later date.",
      },
      { status: 400 },
    );
  }
  if (!bookableSlots.includes(time)) {
    return NextResponse.json(
      {
        error: `Please choose a time at least ${BOOKING_MIN_LEAD_MINUTES / 60} hours from now (Johannesburg time), within business hours.`,
      },
      { status: 400 },
    );
  }

  if (!serviceRaw || !location) {
    return NextResponse.json({ error: "service and location are required." }, { status: 400 });
  }
  if (!SERVICE_IDS.has(serviceRaw)) {
    return NextResponse.json(
      { error: "Invalid service. Use one of: quick, standard, airbnb, deep, carpet, move." },
      { status: 400 },
    );
  }
  if (!userEmail) {
    return NextResponse.json({ error: "Account email is required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .select("billing_type")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const billingType = String((prof as { billing_type?: string } | null)?.billing_type ?? "per_booking").toLowerCase();
  if (billingType !== "monthly") {
    return NextResponse.json(
      {
        error:
          "Self-service bookings from the dashboard are only available for monthly-billed accounts. Please use the standard booking flow to pay per visit.",
      },
      { status: 403 },
    );
  }

  const paystackReference = `dash_${crypto.randomUUID()}`;
  const bookingSnapshot =
    notes.length > 0
      ? { v: 1 as const, customer_notes: notes }
      : null;

  const { data: row, error: insErr } = await admin
    .from("bookings")
    .insert({
      paystack_reference: paystackReference,
      customer_email: userEmail,
      customer_name: null,
      customer_phone: null,
      user_id: userId,
      amount_paid_cents: 0,
      currency: "ZAR",
      booking_snapshot: bookingSnapshot,
      status: "pending",
      dispatch_status: "searching",
      surge_multiplier: 1,
      surge_reason: null,
      service: getServiceLabel(serviceRaw as BookingServiceId),
      rooms: typeof body.rooms === "number" && Number.isFinite(body.rooms) ? Math.round(body.rooms) : null,
      bathrooms: typeof body.bathrooms === "number" && Number.isFinite(body.bathrooms) ? Math.round(body.bathrooms) : null,
      extras: [],
      location,
      location_id: null,
      city_id: null,
      date,
      time,
      total_paid_zar: totalPaidZar,
      pricing_version_id: null,
      price_breakdown: null,
      total_price: null,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !row || typeof (row as { id?: string }).id !== "string") {
    return NextResponse.json({ error: insErr?.message ?? "Could not create booking." }, { status: 500 });
  }

  const bookingId = (row as { id: string }).id;
  void logSystemEvent({
    level: "info",
    source: "customer_dashboard_booking",
    message: "monthly_self_service_booking_created",
    context: {
      bookingId,
      userId,
      date,
      time,
      service: serviceRaw,
      sameDay: date === todayJhb,
      locationChars: location.length,
    },
  });

  return NextResponse.json({ ok: true, bookingId });
}
