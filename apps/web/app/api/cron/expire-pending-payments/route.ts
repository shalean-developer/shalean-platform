import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 500;

/**
 * Marks unpaid `pending_payment` rows past `payment_link_expires_at` as `payment_expired`
 * (dashboard hygiene; distinct from purge of stale rows without expiry).
 *
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`. Suggest daily or hourly.
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

  /* H-15: serialize expiry — duplicate runs would attempt redundant booking-status updates
   * and emit duplicate `payment_needs_follow_up` signals. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.expirePendingPayments, leaseSeconds: 300 },
    async () => {
      const nowIso = new Date().toISOString();

      const { data: rows, error } = await admin
        .from("bookings")
        .select("id")
        .eq("status", "pending_payment")
        .not("payment_link_expires_at", "is", null)
        .lt("payment_link_expires_at", nowIso)
        .limit(MAX_BATCH);

      if (error) {
        await reportOperationalIssue("error", "cron/expire-pending-payments", error.message);
        return { _error: error.message } as const;
      }

      let updated = 0;
      for (const r of rows ?? []) {
        const id = typeof (r as { id?: unknown }).id === "string" ? String((r as { id: string }).id) : "";
        if (!id) continue;
        const { error: upErr } = await admin
          .from("bookings")
          .update({ status: "payment_expired", dispatch_status: "unassigned", payment_needs_follow_up: true })
          .eq("id", id)
          .eq("status", "pending_payment");
        if (!upErr) updated++;
      }

      await logSystemEvent({
        level: "info",
        source: "cron/expire-pending-payments",
        message: "Cron finished",
        context: { scanned: rows?.length ?? 0, updated, nowIso },
      });

      return { scanned: rows?.length ?? 0, updated };
    },
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  if ("_error" in lockResult.ranIt) {
    return NextResponse.json({ error: lockResult.ranIt._error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}

export async function GET(request: Request) {
  return POST(request);
}
