import { NextResponse } from "next/server";
import type { BookingInsertFailedPayload } from "@/lib/booking/failedJobs";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { processLifecycleJob, type LifecycleJobRow } from "@/lib/booking/processLifecycleJob";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { emitSqlExpiredOfferTimeoutMetrics } from "@/lib/dispatch/offerTimeoutMetric";
import { reportPendingBookingSlaBreaches } from "@/lib/dispatch/dispatchSlaWatchdog";
import { processDispatchRetryQueue } from "@/lib/dispatch/dispatchRetryQueue";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOOKING_INSERT_BATCH = 15;
const MAX_LIFECYCLE_RETRY = 20;

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * 1) Retries Paystack booking inserts (`failed_jobs`).
 * 2) Retries lifecycle emails stuck in `failed` with attempts &lt; 5.
 * 3) Processes `dispatch_retry_queue` (auto-assign backoff).
 * 4) SLA: pending bookings without a cleaner past DISPATCH_SLA_BREACH_MINUTES → metric + retry enqueue.
 * 5) Offer timeout metrics parity: SQL-expired TTL offers → dispatch.offer.timeout (deduped).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  await logSystemEvent({
    level: "info",
    source: "cron/retry-failed-jobs",
    message: "Cron started",
    context: {},
  });

  const { data: insertJobs, error: selErr } = await supabase
    .from("failed_jobs")
    .select("id, type, payload, attempts")
    .eq("type", "booking_insert")
    .lt("attempts", 10)
    .order("created_at", { ascending: true })
    .limit(MAX_BOOKING_INSERT_BATCH);

  if (selErr) {
    await reportOperationalIssue("error", "cron/retry-failed-jobs", selErr.message);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  let bookingInsertRetried = 0;
  let bookingInsertSucceeded = 0;

  for (const row of insertJobs ?? []) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    const attempts = typeof row.attempts === "number" ? row.attempts : 0;

    const payload = row.payload as BookingInsertFailedPayload | null;
    if (
      !payload ||
      typeof payload.paystackReference !== "string" ||
      typeof payload.amountCents !== "number"
    ) {
      await supabase.from("failed_jobs").delete().eq("id", id);
      continue;
    }

    bookingInsertRetried++;
    const snapshot = (payload.snapshot ?? null) as BookingSnapshotV1 | null;

    const result = await upsertBookingFromPaystack({
      paystackReference: payload.paystackReference,
      amountCents: payload.amountCents,
      currency: typeof payload.currency === "string" ? payload.currency : "ZAR",
      customerEmail:
        typeof payload.customerEmail === "string" ? normalizeEmail(payload.customerEmail) : "",
      snapshot,
      paystackMetadata: payload.paystackMetadata ?? null,
    });

    if (result.bookingId && !result.error) {
      await supabase.from("failed_jobs").delete().eq("id", id);
      bookingInsertSucceeded++;
      if (!result.skipped) {
        const em =
          typeof payload.customerEmail === "string" ? normalizeEmail(payload.customerEmail) : "";
        if (em) {
          try {
            await notifyBookingEvent({
              type: "payment_confirmed",
              supabase,
              bookingId: result.bookingId,
              snapshot,
              customerEmail: em,
              amountCents: payload.amountCents,
              paymentReference: payload.paystackReference,
            });
          } catch (e) {
            await reportOperationalIssue("error", "cron/retry-failed-jobs/notifyBookingEvent", String(e), {
              bookingId: result.bookingId,
            });
          }
        }
      }
    } else {
      await supabase.from("failed_jobs").update({ attempts: attempts + 1 }).eq("id", id);
    }
  }

  const { data: lifeJobs, error: lifeErr } = await supabase
    .from("booking_lifecycle_jobs")
    .select("id, job_type, customer_email, booking_id, attempts")
    .eq("status", "failed")
    .lt("attempts", 5)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_LIFECYCLE_RETRY);

  if (lifeErr) {
    await reportOperationalIssue("error", "cron/retry-failed-jobs", `lifecycle load: ${lifeErr.message}`);
    return NextResponse.json({ error: lifeErr.message }, { status: 500 });
  }

  let lifecycleRetried = 0;
  let lifecycleSent = 0;
  let lifecycleTerminal = 0;

  for (const row of lifeJobs ?? []) {
    lifecycleRetried++;
    const r = await processLifecycleJob(supabase, row as LifecycleJobRow);
    if (r === "sent") lifecycleSent++;
    if (r === "terminal") lifecycleTerminal++;
  }

  const dispatchRetry = await processDispatchRetryQueue(supabase);
  const dispatchSla = await reportPendingBookingSlaBreaches(supabase);
  const dispatchOfferTimeoutMetrics = await emitSqlExpiredOfferTimeoutMetrics(supabase);

  await logSystemEvent({
    level: "info",
    source: "cron/retry-failed-jobs",
    message: "Cron finished",
    context: {
      bookingInsertRetried,
      bookingInsertSucceeded,
      lifecycleRetried,
      lifecycleSent,
      lifecycleTerminal,
      dispatchRetry,
      dispatchSla,
      dispatchOfferTimeoutMetrics,
    },
  });

  return NextResponse.json({
    ok: true,
    bookingInsert: {
      retried: bookingInsertRetried,
      succeeded: bookingInsertSucceeded,
    },
    lifecycle: {
      retried: lifecycleRetried,
      sent: lifecycleSent,
      terminalFailures: lifecycleTerminal,
    },
    dispatchRetry,
    dispatchSla,
    dispatchOfferTimeoutMetrics,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
