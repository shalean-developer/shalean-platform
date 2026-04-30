import { NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { executeAllCleanersApprovedEarningsPaystack } from "@/lib/payout/executeCleanerApprovedEarningsPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Sends Paystack transfers for all cleaners with approved `cleaner_earnings` rows.
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
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const batch = await executeAllCleanersApprovedEarningsPaystack(admin, { initiatedBy: "cron/cleaner-earnings-auto-payout" });

  const paid = batch.results.filter((r) => r.ok && r.disbursement_id).length;
  const failed = batch.results.filter((r) => !r.ok).length;

  await logSystemEvent({
    level: failed ? "warn" : "info",
    source: "cron/cleaner-earnings-auto-payout",
    message: "Ledger earnings auto-payout batch finished",
    context: { cleaners: batch.cleaners, paid, failed, sample: batch.results.slice(0, 20) },
  });

  return NextResponse.json({ ok: true, cleaners: batch.cleaners, paid, failed, results: batch.results });
}

export async function GET(request: Request) {
  return POST(request);
}
