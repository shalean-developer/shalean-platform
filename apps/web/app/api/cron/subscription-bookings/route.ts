import { NextResponse } from "next/server";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import {
  sendSubscriptionChargeFailedEmail,
  sendSubscriptionChargeSuccessEmail,
  sendSubscriptionPrechargeReminderEmail,
} from "@/lib/email/subscriptionEmails";
import { nextDateFrom, type SubscriptionFrequency } from "@/lib/subscriptions/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_RETRY = 3;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!paystackSecret) return NextResponse.json({ error: "PAYSTACK_SECRET_KEY not configured." }, { status: 503 });

  const today = todayYmd();
  const t = new Date(`${today}T00:00:00`);
  t.setDate(t.getDate() + 1);
  const tomorrowYmd = t.toISOString().slice(0, 10);

  const { data: tomorrowSubs } = await admin
    .from("subscriptions")
    .select("id, user_id, service_type, next_booking_date, status, last_reminder_date")
    .eq("status", "active")
    .eq("next_booking_date", tomorrowYmd)
    .limit(500);
  for (const s of tomorrowSubs ?? []) {
    if ((s as { last_reminder_date?: string | null }).last_reminder_date === today) continue;
    const userRes = await admin.auth.admin.getUserById(String(s.user_id));
    const email = normalizeEmail(String(userRes.data.user?.email ?? ""));
    if (!email) continue;
    await sendSubscriptionPrechargeReminderEmail({
      to: email,
      serviceLabel: String(s.service_type ?? "cleaning"),
      dateYmd: tomorrowYmd,
    });
    await admin.from("subscriptions").update({ last_reminder_date: today }).eq("id", s.id);
  }

  const { data: subscriptions, error } = await admin
    .from("subscriptions")
    .select("id, user_id, city_id, service_type, frequency, day_of_week, time_slot, address, price_per_visit, next_booking_date, status, authorization_code, retry_count")
    .eq("status", "active")
    .lte("next_booking_date", today)
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let created = 0;
  let assigned = 0;
  let chargeSuccess = 0;
  let chargeFailed = 0;
  for (const s of subscriptions ?? []) {
    const authCode = String((s as { authorization_code?: string | null }).authorization_code ?? "");
    if (!authCode) {
      await admin
        .from("subscriptions")
        .update({
          payment_status: "failed",
          last_payment_error: "Missing authorization_code for autopay",
          retry_count: MAX_RETRY,
          status: "paused",
        })
        .eq("id", s.id);
      chargeFailed++;
      continue;
    }

    const userRes = await admin.auth.admin.getUserById(String(s.user_id));
    const email = normalizeEmail(String(userRes.data.user?.email ?? ""));
    if (!email) continue;

    const amountCents = Math.max(0, Math.round(Number(s.price_per_visit ?? 0))) * 100;
    const chargeRes = await fetch("https://api.paystack.co/transaction/charge_authorization", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        authorization_code: authCode,
        email,
        amount: amountCents,
      }),
    });
    const chargeJson = (await chargeRes.json()) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; reference?: string };
    };

    if (!chargeRes.ok || chargeJson.status !== true || String(chargeJson.data?.status ?? "").toLowerCase() !== "success") {
      const nextRetry = Number((s as { retry_count?: number | null }).retry_count ?? 0) + 1;
      const failMsg = chargeJson.message ?? "charge_authorization failed";
      await admin
        .from("subscriptions")
        .update({
          payment_status: "failed",
          retry_count: nextRetry,
          last_payment_error: failMsg,
          ...(nextRetry >= MAX_RETRY ? { status: "paused" } : {}),
        })
        .eq("id", s.id);
      await sendSubscriptionChargeFailedEmail({
        to: email,
        serviceLabel: String(s.service_type ?? "cleaning"),
      });
      chargeFailed++;
      continue;
    }
    chargeSuccess++;

    const bookingRef = `sub_${s.id}_${today}`;
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("paystack_reference", bookingRef)
      .maybeSingle();
    if (existing?.id) {
      const next = nextDateFrom(today, s.frequency as SubscriptionFrequency);
      await admin.from("subscriptions").update({ next_booking_date: next }).eq("id", s.id);
      continue;
    }

    const amountZar = Math.max(0, Math.round(Number(s.price_per_visit ?? 0)));
    const { data: booking, error: insErr } = await admin
      .from("bookings")
      .insert({
        paystack_reference: bookingRef,
        customer_email: "",
        user_id: s.user_id,
        amount_paid_cents: amountZar * 100,
        total_paid_cents: amountZar * 100,
        base_amount_cents: amountZar * 100,
        extras_amount_cents: 0,
        service_fee_cents: 0,
        currency: "ZAR",
        booking_snapshot: {
          v: 1,
          subscription: { id: s.id, frequency: s.frequency },
          customer: { user_id: s.user_id, type: "login" },
        },
        status: "pending",
        dispatch_status: "searching",
        city_id: (s as { city_id?: string | null }).city_id ?? null,
        service: s.service_type,
        location: s.address,
        date: today,
        time: s.time_slot,
        total_paid_zar: amountZar,
      })
      .select("id, created_at")
      .single();
    if (insErr || !booking?.id) continue;
    created++;

    if (email) {
      await admin.from("bookings").update({ customer_email: email }).eq("id", booking.id);
    }
    await recordBookingSideEffects({
      supabase: admin,
      bookingId: booking.id,
      userId: String(s.user_id),
      customerEmail: email,
      amountCents: amountZar * 100,
      paystackReference: String(chargeJson.data?.reference ?? bookingRef),
      createdAt: booking.created_at ?? new Date().toISOString(),
      appointmentDateYmd: today,
      appointmentTimeHm: String(s.time_slot ?? ""),
    });

    const assign = await ensureBookingAssignment(admin, booking.id, { source: "subscription_autopay" });
    if (assign.ok) assigned++;

    const next = nextDateFrom(today, s.frequency as SubscriptionFrequency);
    await admin.from("subscriptions").update({
      next_booking_date: next,
      payment_status: "success",
      retry_count: 0,
      last_payment_error: null,
      last_charge_reference: String(chargeJson.data?.reference ?? ""),
      last_payment_date: today,
    }).eq("id", s.id);
    await sendSubscriptionChargeSuccessEmail({
      to: email,
      serviceLabel: String(s.service_type ?? "cleaning"),
      dateYmd: today,
    });
  }

  return NextResponse.json({
    ok: true,
    processed: subscriptions?.length ?? 0,
    created,
    assigned,
    chargeSuccess,
    chargeFailed,
    tomorrowRemindersChecked: tomorrowSubs?.length ?? 0,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
