import { NextResponse } from "next/server";
import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { persistPaymentLinkDelivery } from "@/lib/admin/persistPaymentLinkDelivery";
import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  escalateReminderSchedule,
  reminderScheduleForPriorBucket,
} from "@/lib/pay/paymentLinkDeliveryStats";
import { predictPaymentRisk } from "@/lib/pay/paymentDecisionEngine";
import {
  fetchRecentPaymentLinkChannelStats,
  recordPaymentLinkDecision,
  resolvePaymentLinkDispatchDecision,
} from "@/lib/pay/paymentDecisionDispatch";
import { priorPaymentConversionBucketForCustomer } from "@/lib/pay/priorPaymentConversionBucket";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN = 300;
/** Widen scan so “slow” adaptive ~2h window still fits in one cron sweep. */
const SCAN_EXPIRES_MAX_MIN = 130;

function isoPlusMinutes(baseMs: number, min: number): string {
  return new Date(baseMs + min * 60 * 1000).toISOString();
}

type Row = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  total_paid_zar: number | string | null;
  payment_link: string | null;
  paystack_reference: string | null;
  payment_link_expires_at: string | null;
  payment_link_reminder_1h_sent_at: string | null;
  payment_link_reminder_15m_sent_at: string | null;
  booking_snapshot: unknown;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_link_delivery: unknown;
  payment_conversion_bucket: string | null;
  payment_last_touch_channel: string | null;
};

/**
 * Adaptive reminders before `payment_link_expires_at` (WhatsApp → SMS; no email).
 * Uses last `payment_conversion_bucket` for the customer (email, else phone digits): instant → skip nudges;
 * slow/medium → earlier windows; default otherwise. Vercel Cron ~15m + `Authorization: Bearer CRON_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const now = Date.now();

  const { data: candidates, error } = await admin
    .from("bookings")
    .select(
      "id, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, payment_link, paystack_reference, payment_link_expires_at, payment_link_reminder_1h_sent_at, payment_link_reminder_15m_sent_at, booking_snapshot, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel",
    )
    .eq("status", "pending_payment")
    .not("payment_link_expires_at", "is", null)
    .not("payment_link", "is", null)
    .gte("payment_link_expires_at", isoPlusMinutes(now, 5))
    .lte("payment_link_expires_at", isoPlusMinutes(now, SCAN_EXPIRES_MAX_MIN))
    .limit(MAX_SCAN);

  if (error) {
    await reportOperationalIssue("error", "cron/payment-link-reminders", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent1h = 0;
  let sent15m = 0;
  let skipped = 0;
  let skippedAdaptiveInstant = 0;
  const priorBucketCache = new Map<string, PaymentConversionBucket | null>();
  const channelStats = await fetchRecentPaymentLinkChannelStats(admin);

  for (const raw of candidates ?? []) {
    const row = raw as Row;
    const expMs = row.payment_link_expires_at ? new Date(row.payment_link_expires_at).getTime() : NaN;
    if (!Number.isFinite(expMs) || !row.payment_link || !row.paystack_reference) {
      skipped++;
      continue;
    }

    const phone = String(row.customer_phone ?? "").trim();
    const email = String(row.customer_email ?? "").trim();
    if (!phone && !email) {
      skipped++;
      continue;
    }

    const priorBucket = await priorPaymentConversionBucketForCustomer(
      admin,
      {
        emailRaw: row.customer_email,
        phoneRaw: row.customer_phone,
        excludeBookingId: row.id,
      },
      priorBucketCache,
    );
    const risk = predictPaymentRisk({
      payment_link_send_count: Number(row.payment_link_send_count ?? 0),
      payment_conversion_bucket: row.payment_conversion_bucket,
      priorPaymentConversionBucket: priorBucket,
      payment_link_first_sent_at: row.payment_link_first_sent_at,
      payment_link_delivery: row.payment_link_delivery,
      nowMs: now,
    });
    const schedule = escalateReminderSchedule(reminderScheduleForPriorBucket(priorBucket), risk.risk_level);
    if (schedule.skipReminders) {
      skippedAdaptiveInstant++;
      skipped++;
      continue;
    }

    const minutesLeft = (expMs - now) / 60_000;
    const send15m =
      !row.payment_link_reminder_15m_sent_at &&
      minutesLeft <= schedule.window15mMax &&
      minutesLeft >= schedule.window15mMin;
    const send1h =
      !send15m &&
      !row.payment_link_reminder_1h_sent_at &&
      minutesLeft <= schedule.window1hMax &&
      minutesLeft >= schedule.window1hMin;

    if (!send1h && !send15m) {
      skipped++;
      continue;
    }

    const pass = send15m ? "reminder_15m" : "reminder_1h";

    const snap = row.booking_snapshot as BookingSnapshotV1 | null;
    const locked = snap?.locked;
    const lockedRec = locked && typeof locked === "object" ? (locked as Record<string, unknown>) : null;
    const serviceId = lockedRec?.service;
    const serviceLabel =
      typeof serviceId === "string" && serviceId.trim()
        ? getServiceLabel(serviceId as BookingServiceId)
        : row.service != null
          ? String(row.service)
          : "Cleaning";
    const dateLabel = row.date != null ? String(row.date) : "—";
    const timeLabel = row.time != null ? String(row.time) : "—";
    const name = String(row.customer_name ?? "").trim();

    const totalZarRaw = row.total_paid_zar;
    const amountZar =
      typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
        ? Math.round(totalZarRaw)
        : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(totalZarRaw.trim())
          ? Math.round(Number(totalZarRaw))
          : null;

    try {
      const decision = await resolvePaymentLinkDispatchDecision(
        admin,
        {
          id: row.id,
          customer_email: row.customer_email,
          customer_phone: row.customer_phone,
          payment_link_send_count: row.payment_link_send_count,
          payment_conversion_bucket: row.payment_conversion_bucket,
          payment_link_first_sent_at: row.payment_link_first_sent_at,
          payment_link_delivery: row.payment_link_delivery,
          payment_last_touch_channel: row.payment_last_touch_channel,
        },
        {
          intent: "reminder",
          notificationMode: "chain",
          channelStats,
          priorCache: priorBucketCache,
        },
      );
      if (!decision.send_now) {
        skipped++;
        continue;
      }
      await recordPaymentLinkDecision(
        admin,
        {
          id: row.id,
          customer_email: row.customer_email,
          customer_phone: row.customer_phone,
          payment_link_send_count: row.payment_link_send_count,
          payment_conversion_bucket: row.payment_conversion_bucket,
          payment_link_first_sent_at: row.payment_link_first_sent_at,
          payment_link_delivery: row.payment_link_delivery,
          payment_last_touch_channel: row.payment_last_touch_channel,
        },
        decision,
        "reminder",
      );

      const linkForMessaging = trustPayPageUrl(row.id, row.paystack_reference, row.payment_link);
      const delivery = await deliverAdminPaymentLink({
        phone: phone || null,
        email: email || null,
        mode: "chain",
        phoneTryOrder: decision.phoneTryOrder.length ? decision.phoneTryOrder : undefined,
        emailPayload: {
          customerEmail: email,
          customerName: name || null,
          serviceLabel,
          dateLabel,
          timeLabel,
          amountZar,
          paymentUrl: row.payment_link,
          bookingId: row.id,
          paystackReference: row.paystack_reference,
        },
        waPayload: {
          customerName: name || "there",
          paymentLink: linkForMessaging,
          service: serviceLabel,
          date: dateLabel,
          time: timeLabel,
        },
        context: { bookingId: row.id, stage: pass },
      });

      await persistPaymentLinkDelivery(admin, row.id, delivery, {
        pass,
        touchLastSentAt: false,
      });

      const patch: Record<string, unknown> = {};
      if (send1h) patch.payment_link_reminder_1h_sent_at = new Date().toISOString();
      if (send15m) patch.payment_link_reminder_15m_sent_at = new Date().toISOString();
      if (Object.keys(patch).length) {
        await admin.from("bookings").update(patch).eq("id", row.id);
      }

      if (send15m) sent15m++;
      else sent1h++;
    } catch (e) {
      await reportOperationalIssue("error", "cron/payment-link-reminders", String(e), { bookingId: row.id });
      skipped++;
    }
  }

  await logSystemEvent({
    level: "info",
    source: "cron/payment-link-reminders",
    message: "Cron finished",
    context: {
      scanned: candidates?.length ?? 0,
      sent1h,
      sent15m,
      skipped,
      skipped_adaptive_instant: skippedAdaptiveInstant,
    },
  });

  return NextResponse.json({
    ok: true,
    scanned: candidates?.length ?? 0,
    sent1h,
    sent15m,
    skipped,
    skippedAdaptiveInstant,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
