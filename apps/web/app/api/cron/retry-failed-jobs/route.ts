import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import type { BookingInsertFailedPayload } from "@/lib/booking/failedJobs";
import { formatFailedJobPayloadPreview } from "@/lib/booking/failedJobPayloadPreview";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { processLifecycleJob, type LifecycleJobRow } from "@/lib/booking/processLifecycleJob";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { emitSqlExpiredOfferTimeoutMetrics } from "@/lib/dispatch/offerTimeoutMetric";
import { reportPendingBookingSlaBreaches } from "@/lib/dispatch/dispatchSlaWatchdog";
import { processDispatchRetryQueue } from "@/lib/dispatch/dispatchRetryQueue";
import { runOfferExpiryMaintenance } from "@/lib/dispatch/processUserSelectedOfferExpiryRedispatch";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processAbandonCheckoutReminders } from "@/lib/conversion/abandonCheckoutReminder";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { logDailyOpsSummaryIfNeeded } from "@/lib/ops/dailyOpsSummary";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";
import { syncCleanerQualityFlags } from "@/lib/ops/enforceCleanerQualityReview";
import { processReviewSmsPromptQueue } from "@/lib/reviews/reviewPromptSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-instance debounce: overlapping invocations within this window skip the full handler. */
let lastCronRetryFailedJobsStartMs = 0;
const CRON_DEBOUNCE_MS = 30_000;

const MAX_BOOKING_INSERT_BATCH = 15;
const MAX_LIFECYCLE_RETRY = 20;

/** `failed_jobs.type` for Paystack booking retries (cron selector). */
const FAILED_JOB_TYPE_BOOKING_INSERT = "booking_insert";
/** Quarantined: payload cannot be retried; row kept for ops (not deleted). */
const FAILED_JOB_TYPE_BOOKING_INSERT_INVALID = "booking_insert_invalid_payload";
/** Terminal: retries exhausted; excluded from cron selector (payload includes last_error / reference / attempts). */
const FAILED_JOB_TYPE_BOOKING_INSERT_EXHAUSTED = "booking_insert_exhausted";
/** Max upsert failures before row stops being auto-selected; escalated via critical log. */
const BOOKING_INSERT_MAX_ATTEMPTS = 25;

const ROUTE = "/api/cron/retry-failed-jobs";

/**
 * Cron: `Authorization: Bearer CRON_SECRET` (Vercel) or `x-cron-secret: CRON_SECRET` (Supabase pg_net).
 * Schedule: every minute via Supabase pg_cron (see migration `20260655_supabase_cron_dispatch_http_minute.sql`).
 * 1) Retries Paystack booking inserts (`failed_jobs`).
 * 2) Retries lifecycle emails stuck in `failed` with attempts &lt; 5.
 *    `booking_insert` jobs: attempts &lt; 25; malformed → `booking_insert_invalid_payload`; exhausted → `booking_insert_exhausted`.
 * 3) Processes `dispatch_retry_queue` (auto-assign backoff).
 * 4) SLA: pending bookings without a cleaner past DISPATCH_SLA_BREACH_MINUTES → metric + retry enqueue.
 * 5) Offer timeout metrics parity: SQL-expired TTL offers → dispatch.offer.timeout (deduped).
 * 6) SQL offer expiry RPC + user-selected bookings with drained offers → re-dispatch (same path as decline).
 */
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const runNow = Date.now();
  if (
    lastCronRetryFailedJobsStartMs > 0 &&
    runNow - lastCronRetryFailedJobsStartMs < CRON_DEBOUNCE_MS
  ) {
    await logSystemEvent({
      level: "info",
      source: "cron/retry-failed-jobs",
      message: "Skipped run (debounce)",
      context: {
        msSinceLastStart: runNow - lastCronRetryFailedJobsStartMs,
        debounceMs: CRON_DEBOUNCE_MS,
      },
    });
    return NextResponse.json({ ok: true, skipped: "recent_run", debounceMs: CRON_DEBOUNCE_MS });
  }
  lastCronRetryFailedJobsStartMs = runNow;

  const runStartedAtIso = new Date().toISOString();
  await logSystemEvent({
    level: "info",
    source: "cron",
    message: "cron.start",
    context: { route: ROUTE, timestamp: runStartedAtIso },
  });

  const failedJobsThreshold = Number(process.env.FAILED_JOBS_ALERT_THRESHOLD ?? "5");
  const thresholdJobs = Number.isFinite(failedJobsThreshold) && failedJobsThreshold > 0 ? failedJobsThreshold : 5;
  const { count: failedJobsOpen } = await supabase.from("failed_jobs").select("id", { count: "exact", head: true });
  if ((failedJobsOpen ?? 0) > thresholdJobs) {
    await postDispatchControlAlert(
      {
        errorType: "failed_jobs_backlog",
        message: `failed_jobs backlog: ${failedJobsOpen ?? 0} open rows (threshold ${thresholdJobs})`,
        dedupeKey: "failed_jobs_backlog",
        dedupeWindowMinutes: 15,
        extra: { count: failedJobsOpen ?? 0, threshold: thresholdJobs },
      },
      { supabase },
    );
  }

  const unassignableThreshold = Number(process.env.UNASSIGNABLE_BOOKINGS_ALERT_THRESHOLD ?? "3");
  const thresholdUnassignable =
    Number.isFinite(unassignableThreshold) && unassignableThreshold > 0 ? unassignableThreshold : 3;
  const { count: terminalDispatchPending } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .in("dispatch_status", ["unassignable", "no_cleaner"]);
  if ((terminalDispatchPending ?? 0) >= thresholdUnassignable) {
    await postDispatchControlAlert(
      {
        errorType: "unassignable_bookings_threshold",
        message: `${terminalDispatchPending ?? 0} paid booking(s) stuck in terminal dispatch (unassignable/no_cleaner)`,
        dedupeKey: "unassignable_bookings_threshold",
        dedupeWindowMinutes: 15,
        extra: { count: terminalDispatchPending ?? 0, threshold: thresholdUnassignable },
      },
      { supabase },
    );
  }

  const { data: insertJobs, error: selErr } = await supabase
    .from("failed_jobs")
    .select("id, type, payload, attempts")
    .eq("type", FAILED_JOB_TYPE_BOOKING_INSERT)
    .lt("attempts", BOOKING_INSERT_MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(MAX_BOOKING_INSERT_BATCH);

  if (selErr) {
    await reportOperationalIssue("error", "cron/retry-failed-jobs", selErr.message);
    await logSystemEvent({
      level: "info",
      source: "cron",
      message: "cron.complete",
      context: { route: ROUTE, result: { ok: false, phase: "failed_jobs_select", error: selErr.message } },
    });
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  let bookingInsertRetried = 0;
  let bookingInsertSucceeded = 0;

  for (const row of insertJobs ?? []) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    const attempts = typeof row.attempts === "number" ? row.attempts : 0;

    try {
      const payload = row.payload as BookingInsertFailedPayload | null;
      if (
        !payload ||
        typeof payload.paystackReference !== "string" ||
        typeof payload.amountCents !== "number"
      ) {
        const payloadPreview = formatFailedJobPayloadPreview(row.payload);
        await reportOperationalIssue(
          "critical",
          "cron/retry-failed-jobs",
          "Malformed booking_insert failed_jobs payload; quarantining job (type change)",
          { errorType: "booking_insert_invalid_payload", failedJobId: id, payloadPreview },
        );
        const { error: quarantineErr } = await supabase
          .from("failed_jobs")
          .update({ type: FAILED_JOB_TYPE_BOOKING_INSERT_INVALID })
          .eq("id", id);
        if (quarantineErr) {
          await reportOperationalIssue("error", "cron/retry-failed-jobs", `quarantine update failed: ${quarantineErr.message}`, {
            failedJobId: id,
          });
        }
        continue;
      }

      bookingInsertRetried++;
      const snapshot = (payload.snapshot ?? null) as BookingSnapshotV1 | null;

      let result: Awaited<ReturnType<typeof upsertBookingFromPaystack>>;
      try {
        result = await upsertBookingFromPaystack({
          paystackReference: payload.paystackReference,
          amountCents: payload.amountCents,
          currency: typeof payload.currency === "string" ? payload.currency : "ZAR",
          customerEmail:
            typeof payload.customerEmail === "string" ? normalizeEmail(payload.customerEmail) : "",
          snapshot,
          paystackMetadata: payload.paystackMetadata ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await reportOperationalIssue("error", "cron/retry-failed-jobs", `upsert threw: ${msg}`, {
          paystackReference: payload.paystackReference,
          failedJobId: id,
        });
        result = { skipped: false, bookingId: null, error: msg };
      }

      if (result.bookingId && !result.error) {
        const { error: delErr } = await supabase.from("failed_jobs").delete().eq("id", id);
        if (delErr) {
          await reportOperationalIssue(
            "warn",
            "cron/retry-failed-jobs",
            `failed_jobs delete after successful booking retry failed (row left for ops; idempotent upsert safe)`,
            {
              failedJobId: id,
              bookingId: result.bookingId,
              paystackReference: payload.paystackReference,
            },
          );
        } else {
          bookingInsertSucceeded++;
        }
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
        const nextAttempts = attempts + 1;
        const lastError = result.error ?? "unknown";

        if (nextAttempts >= BOOKING_INSERT_MAX_ATTEMPTS) {
          const terminalPayload = {
            ...payload,
            _bookingInsertExhausted: {
              last_error: String(lastError).slice(0, 4000),
              paystack_reference: payload.paystackReference,
              attempts: nextAttempts,
              at: new Date().toISOString(),
            },
          };
          const { error: exErr } = await supabase
            .from("failed_jobs")
            .update({
              type: FAILED_JOB_TYPE_BOOKING_INSERT_EXHAUSTED,
              attempts: nextAttempts,
              payload: terminalPayload,
            })
            .eq("id", id);
          if (exErr) {
            await reportOperationalIssue(
              "error",
              "cron/retry-failed-jobs",
              `booking_insert exhaustion update failed: ${exErr.message}`,
              { failedJobId: id, paystackReference: payload.paystackReference },
            );
          } else {
            await reportOperationalIssue(
              "critical",
              "cron/retry-failed-jobs",
              "booking_insert retry attempts exhausted; job moved to booking_insert_exhausted",
              {
                errorType: "booking_insert_exhausted",
                failedJobId: id,
                paystackReference: payload.paystackReference,
                attempts: nextAttempts,
                last_error: String(lastError).slice(0, 500),
              },
            );
          }
        } else {
          const { error: attErr } = await supabase.from("failed_jobs").update({ attempts: nextAttempts }).eq("id", id);
          if (attErr) {
            await reportOperationalIssue("error", "cron/retry-failed-jobs", `attempts increment failed: ${attErr.message}`, {
              failedJobId: id,
            });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "cron/retry-failed-jobs", `booking_insert iteration failed: ${msg}`, {
        failedJobId: id,
      });
      const { error: attErr } = await supabase.from("failed_jobs").update({ attempts: attempts + 1 }).eq("id", id);
      if (attErr) {
        await reportOperationalIssue("error", "cron/retry-failed-jobs", `attempts increment after iteration error: ${attErr.message}`, {
          failedJobId: id,
        });
      }
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
    await logSystemEvent({
      level: "info",
      source: "cron",
      message: "cron.complete",
      context: { route: ROUTE, result: { ok: false, phase: "lifecycle_select", error: lifeErr.message } },
    });
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

  const offerExpiryMaintenance = await runOfferExpiryMaintenance(supabase);
  const dispatchRetry = await processDispatchRetryQueue(supabase);
  const dispatchSla = await reportPendingBookingSlaBreaches(supabase);
  const dispatchOfferTimeoutMetrics = await emitSqlExpiredOfferTimeoutMetrics(supabase);

  const reviewSmsPrompts = await processReviewSmsPromptQueue(supabase);
  const abandonCheckoutReminders = await processAbandonCheckoutReminders(supabase);
  const dailyOpsSummary = await logDailyOpsSummaryIfNeeded(supabase);
  const cleanerQuality = await syncCleanerQualityFlags(supabase);

  let failedJobsCleaned = 0;
  if (process.env.FAILED_JOBS_CLEANUP_ENABLED?.trim().toLowerCase() === "true") {
    const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedRows, error: cleanupErr } = await supabase
      .from("failed_jobs")
      .delete()
      .in("type", [FAILED_JOB_TYPE_BOOKING_INSERT_INVALID, FAILED_JOB_TYPE_BOOKING_INSERT_EXHAUSTED])
      .lt("created_at", cutoffIso)
      .select("id");
    if (cleanupErr) {
      await reportOperationalIssue("warn", "cron/retry-failed-jobs", `failed_jobs terminal cleanup: ${cleanupErr.message}`);
    } else {
      failedJobsCleaned = deletedRows?.length ?? 0;
    }
  }

  const resultPayload = {
    ok: true as const,
    bookingInsertRetried,
    bookingInsertSucceeded,
    lifecycleRetried,
    lifecycleSent,
    lifecycleTerminal,
    dispatchRetry,
    offerExpiryMaintenance,
    dispatchSla,
    dispatchOfferTimeoutMetrics,
    failedJobsCleaned,
    reviewSmsPrompts,
    abandonCheckoutReminders,
    dailyOpsSummary,
    cleanerQuality,
  };

  await logSystemEvent({
    level: "info",
    source: "cron",
    message: "cron.complete",
    context: { route: ROUTE, result: resultPayload },
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
    offerExpiryMaintenance,
    dispatchSla,
    dispatchOfferTimeoutMetrics,
    failedJobsCleanup: {
      deleted: failedJobsCleaned,
      enabled: process.env.FAILED_JOBS_CLEANUP_ENABLED?.trim().toLowerCase() === "true",
    },
    reviewSmsPrompts,
    abandonCheckoutReminders,
    dailyOpsSummary,
    cleanerQuality,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
