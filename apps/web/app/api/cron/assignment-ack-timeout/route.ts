import { NextResponse } from "next/server";
import { ASSIGNMENT_ACK_TIMEOUT_MINUTES, runAssignmentAckTimeouts } from "@/lib/booking/runAssignmentAckTimeouts";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Releases bookings stuck in `assigned` (no accept/decline) after {@link ASSIGNMENT_ACK_TIMEOUT_MINUTES} minutes
 * and runs one automatic reassignment per booking (same path as decline).
 *
 * Suggested: every 5 minutes → POST /api/cron/assignment-ack-timeout
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

  /* H-15: serialize ack-timeout — duplicate runs would attempt to release the same `assigned`
   * bookings and trigger duplicate reassignment paths. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.assignmentAckTimeout, leaseSeconds: 300 },
    () => runAssignmentAckTimeouts(admin),
  );
  if (lockResult.skipped) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: lockResult.reason,
      timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES,
    });
  }
  const { processed, errors, skipped, skipReason } = lockResult.ranIt;

  await logSystemEvent({
    level: errors > 0 ? "warn" : "info",
    source: "cron/assignment-ack-timeout",
    message: skipped ? "Assignment ack timeout paused (SMS degraded)" : "Assignment ack timeout tick complete",
    context: { processed, errors, skipped: Boolean(skipped), skipReason: skipReason ?? null, timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES },
  });

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    skipped: Boolean(skipped),
    skipReason: skipReason ?? null,
    timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES,
  });
}
