import { NextResponse } from "next/server";
import { addDaysYmd, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { sendRecurringVisitPrechargeReminderEmail } from "@/lib/email/subscriptionEmails";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
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
  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      user_id: string | null;
      customer_email: string | null;
      service: string | null;
      date: string | null;
    };

    let email = normalizeEmail(String(row.customer_email ?? ""));
    if (!email && row.user_id) {
      const u = await admin.auth.admin.getUserById(row.user_id);
      email = normalizeEmail(String(u.data.user?.email ?? ""));
    }
    if (!email) continue;

    const serviceLabel = row.service != null && String(row.service).trim() ? String(row.service) : "cleaning";
    const visitDate = row.date != null ? String(row.date) : tomorrow;

    await sendRecurringVisitPrechargeReminderEmail({
      to: email,
      serviceLabel,
      visitDateYmd: visitDate,
    });

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
    context: { scanned: rows?.length ?? 0, sent },
  });

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, sent, tomorrow });
}

export async function GET(request: Request) {
  return POST(request);
}
