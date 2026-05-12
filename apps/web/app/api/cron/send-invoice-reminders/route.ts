import { NextResponse } from "next/server";

import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { runSendInvoiceReminders } from "@/lib/monthlyInvoice/runSendInvoiceReminders";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel / Supabase cron: `Authorization: Bearer CRON_SECRET`.
 * Sends +3 / +7 / +14 day overdue reminders (Africa/Johannesburg) for open monthly invoices;
 * logs `invoice_reminder_sent` per channel attempt on `monthly_invoice_events`.
 *
 * Schedule: see `vercel.json` (default 09:00 UTC — adjust to SAST if desired).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  /* H-15: serialize invoice reminders — duplicate runs could race to log
   * `invoice_reminder_sent` events twice for the same +3/+7/+14 window. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.sendInvoiceReminders, leaseSeconds: 600 },
    () => runSendInvoiceReminders(admin),
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  const result = lockResult.ranIt;
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
