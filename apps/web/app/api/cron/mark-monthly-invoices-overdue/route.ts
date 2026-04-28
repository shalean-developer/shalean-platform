import { NextResponse } from "next/server";

import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets `is_overdue` and `account_billing_risk` via DB RPC (does not replace `partially_paid` with a status of overdue).
 *
 * Suggested: daily with CRON_SECRET → POST /api/cron/mark-monthly-invoices-overdue
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const today = todayJohannesburg();

  const { data: rpcData, error } = await admin.rpc("mark_monthly_invoice_overdue_flags", {
    p_today: today,
  });

  if (error) {
    await reportOperationalIssue("error", "cron/mark-monthly-invoices-overdue", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = typeof rpcData === "number" ? rpcData : Number(rpcData ?? 0);

  await logSystemEvent({
    level: "info",
    source: "cron/mark-monthly-invoices-overdue",
    message: "overdue_mark_done",
    context: { today, invoices_flagged: updated },
  });

  return NextResponse.json({ ok: true, today, invoices_flagged: updated });
}

export async function GET(request: Request) {
  return POST(request);
}
