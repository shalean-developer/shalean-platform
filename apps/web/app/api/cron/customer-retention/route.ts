import { NextResponse } from "next/server";
import { runCustomerRetentionCronBatch } from "@/lib/growth/runCustomerRetentionCron";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Evaluates retention states and sends win-back / reminder messages (email first, SMS fallback) within growth cooldowns.
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

  const started = new Date().toISOString();
  try {
    const summary = await runCustomerRetentionCronBatch(admin);
    await logSystemEvent({
      level: "info",
      source: "cron/customer-retention",
      message: "Cron finished",
      context: { started, finished: new Date().toISOString(), ...summary },
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "cron/customer-retention", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
