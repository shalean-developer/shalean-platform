import { NextResponse } from "next/server";
import { ASSIGNMENT_ACK_TIMEOUT_MINUTES, runAssignmentAckTimeouts } from "@/lib/booking/runAssignmentAckTimeouts";
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

  const { processed, errors } = await runAssignmentAckTimeouts(admin);

  await logSystemEvent({
    level: errors > 0 ? "warn" : "info",
    source: "cron/assignment-ack-timeout",
    message: "Assignment ack timeout tick complete",
    context: { processed, errors, timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES },
  });

  return NextResponse.json({ ok: true, processed, errors, timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES });
}
