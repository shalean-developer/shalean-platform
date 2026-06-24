import { NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { addDaysYmd, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { sendRecurringVisitPrechargeReminderEmail } from "@/lib/email/subscriptionEmails";
import { resolveCustomerOutboundEmail } from "@/lib/customer/readCustomerProfileContact";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN = 200;

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * One-time email the day before service (`bookings.date` = tomorrow SAST) for recurring-generated
 * `pending_payment` rows that have not yet received this reminder.
 *
 * Suggested: daily ~08:00 SAST → POST /api/cron/recurring-precharge-reminders
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  /* H-15: serialize precharge reminders — duplicate runs would race to send the same email
   * and stamp `recurring_precharge_notified_at` twice. */
  const lockAcq = await acquireCronLock(admin, {
    jobName: CRON_LOCK_KEYS.recurringPrechargeReminders,
    leaseSeconds: 600,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  try {
  const tomorrow = addDaysYmd(todayJohannesburg(), 1);
  const { data: rows, error } = await admin
    .from("bookings")
    .select("id, user_id, customer_email, service, date, recurring_precharge_notified_at")
    .eq("status", "pending_payment")
    .eq("is_recurring_generated", true)
    .eq("date", tomorrow)
    .is("recurring_precharge_notified_at", null)
    .is("recurring_fallback_at", null)
    .limit(MAX_SCAN);

  if (error) {
    await reportOperationalIssue("error", "cron/recurring-precharge-reminders", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      user_id: string | null;
      customer_email: string | null;
      service: string | null;
      date: string | null;
    };

    const email = row.user_id
      ? await resolveCustomerOutboundEmail(admin, row.user_id, { bookingCustomerEmail: row.customer_email })
      : pickBillingEmail([row.customer_email]);
    if (!email) continue;

    const serviceLabel = row.service != null && String(row.service).trim() ? String(row.service) : "cleaning";
    const visitDate = row.date != null ? String(row.date) : tomorrow;

    const mail = await sendRecurringVisitPrechargeReminderEmail({
      to: email,
      serviceLabel,
      visitDateYmd: visitDate,
    });

    if (!mail.sent) {
      failed++;
      await reportOperationalIssue("warn", "cron/recurring-precharge-reminders", mail.error ?? "email_failed", {
        booking_id: row.id,
        to: email,
      });
      continue;
    }

    await admin.from("bookings").update({ recurring_precharge_notified_at: new Date().toISOString() }).eq("id", row.id);

    sent++;
    await logSystemEvent({
      level: "info",
      source: "cron/recurring-precharge-reminders",
      message: "recurring_precharge_reminder_sent",
      context: { booking_id: row.id, visit_date: visitDate },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "cron/recurring-precharge-reminders",
    message: "Cron finished",
    context: { scanned: rows?.length ?? 0, sent, failed },
  });

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, sent, failed, tomorrow });
  } finally {
    await releaseCronLock(admin, lockAcq.jobName, lockAcq.holderId);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
