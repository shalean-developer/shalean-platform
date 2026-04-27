import { NextResponse } from "next/server";
import { processDueDeferredPaymentLinkEmails } from "@/lib/conversion/deferredPaymentLinkEmailQueue";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Processes queued payment-link emails (`conversion_deferred_payment_link_emails`).
 * Vercel Cron: ~1–5m + `Authorization: Bearer CRON_SECRET`.
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

  try {
    const stats = await processDueDeferredPaymentLinkEmails(admin, { limit: 30 });
    await logSystemEvent({
      level: "info",
      source: "cron/deferred-payment-link-emails",
      message: "Cron finished",
      context: stats,
    });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    await reportOperationalIssue("error", "cron/deferred-payment-link-emails", String(e));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
