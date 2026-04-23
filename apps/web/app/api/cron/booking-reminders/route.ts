import { NextResponse } from "next/server";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { notifyCustomerBookingReminderSoon } from "@/lib/notifications/customerUserNotifications";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCAN = 400;

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Sends one in-app reminder per booking ~2h before visit (Africa/Johannesburg wall time),
 * using a ±30 minute band (~1h30–2h30 lead) so occasional missed cron runs still land inside the window.
 *
 * Configure in Vercel: cron every 15 minutes → POST /api/cron/booking-reminders
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

  const today = todayYmdJohannesburg();
  const { data: rows, error } = await admin
    .from("bookings")
    .select("id, date, time, status, user_id")
    .not("user_id", "is", null)
    .in("status", ["pending", "confirmed", "assigned"])
    .not("date", "is", null)
    .not("time", "is", null)
    .gte("date", today)
    .limit(MAX_SCAN);

  if (error) {
    await reportOperationalIssue("error", "cron/booking-reminders", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  for (const r of rows ?? []) {
    const id = typeof (r as { id?: unknown }).id === "string" ? String((r as { id: string }).id) : "";
    if (!id) {
      skipped++;
      continue;
    }
    const ok = await notifyCustomerBookingReminderSoon(admin, id);
    if (ok) sent++;
    else skipped++;
  }

  await logSystemEvent({
    level: "info",
    source: "cron/booking-reminders",
    message: "Cron finished",
    context: { scanned: rows?.length ?? 0, sent, skipped },
  });

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, sent, skipped });
}

export async function GET(request: Request) {
  return POST(request);
}
