import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { syncInvoiceStatusesFromZoho } from "@/lib/accounting/syncInvoiceMetadata";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logCronRun } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bounded status polling; do not modify local invoice payment or cleaner payout truth.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.accountingSync, leaseSeconds: 600 },
      () => syncInvoiceStatusesFromZoho(admin, 5),
    );
    if (lockResult.skipped) {
      await logCronRun({ jobName: "zoho-invoice-status-refresh", status: "success", message: "skipped", context: { skipped: true, reason: lockResult.reason } });
      return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
    }
    const result = lockResult.ranIt;
    await logCronRun({ jobName: "zoho-invoice-status-refresh", status: result.failed ? "error" : "success", message: `checked=${result.synced + result.failed};synced=${result.synced};failed=${result.failed}`, context: { checked: result.synced + result.failed, synced: result.synced, failed: result.failed } });
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
  } catch (error) {
    await logCronRun({ jobName: "zoho-invoice-status-refresh", status: "error", message: error instanceof Error ? error.message : "invoice_status_refresh_failed" });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "invoice_status_refresh_failed" },
      { status: 503 },
    );
  }
}
