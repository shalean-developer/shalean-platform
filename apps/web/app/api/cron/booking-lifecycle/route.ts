import { NextResponse } from "next/server";
import { addDaysToYmd, johannesburgNineAmIso } from "@/lib/booking/dateYmdAddDays";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { evaluateRebookEligibility } from "@/lib/booking/lifecycleEmailGuards";
import { processLifecycleJob, type LifecycleJobRow } from "@/lib/booking/processLifecycleJob";
import { evaluateLifecycleEmailAlerts } from "@/lib/admin/lifecycleEmailMonitoring";
import { logSystemEvent, reportOperationalIssue, logCronRun } from "@/lib/logging/systemLog";
import { completeCleanerReferralOnFirstJob } from "@/lib/referrals/server";
import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAssignmentOutcomeAndLearn } from "@/lib/marketplace-intelligence/assignmentOutcomeFeedback";
import { buildBookingEvent } from "@/lib/booking/bookingEvents";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { isBookingCompletedRouterEnabled, routeBookingNotificationEvent } from "@/lib/notifications/notificationRouter";
import {
  fetchBookingDisplayEarningsCents,
  isCompletableDisplayEarningsCents,
  resolvePersistCleanerIdForBooking,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";
import { buildCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { syncCleanersBusyAfterBookingTerminalChange } from "@/lib/cleaner/syncCleanerStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JOBS = 50;
const MAX_COMPLETE = 80;

async function markPastBookingsCompleted(): Promise<{ completed: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { completed: 0 };

  const today = todayYmdJohannesburg();
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data: past, error } = await admin
    .from("bookings")
    .select(`id, ${ownershipColumn}, cleaner_id, payout_owner_cleaner_id, is_team_job, date, status, customer_email, dispatch_status, recurring_id, is_recurring_generated`)
    .in("status", ["pending", "assigned", "in_progress"])
    .not("date", "is", null)
    .lt("date", today)
    .limit(MAX_COMPLETE);

  if (error || !past?.length) return { completed: 0 };

  let completed = 0;
  for (const b of past) {
    const id = typeof b.id === "string" ? b.id : null;
    if (!id) continue;

    const { data: ev } = await admin
      .from("user_events")
      .select("id")
      .eq("booking_id", id)
      .eq("event_type", "booking_completed")
      .maybeSingle();

    if (ev) continue;

    const uid = bookingCustomerKey(b as { customer_id?: string | null; user_id?: string | null }) || null;
    const row = b as {
      cleaner_id?: string | null;
      payout_owner_cleaner_id?: string | null;
      is_team_job?: boolean | null;
    };
    const cleanerId = typeof row.cleaner_id === "string" ? row.cleaner_id.trim() : null;
    const persistCleanerId = resolvePersistCleanerIdForBooking(row);
    const dateYmd = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
    const rawEmail = typeof b.customer_email === "string" ? b.customer_email : "";
    const completedAt = new Date().toISOString();

    if (!persistCleanerId) {
      await reportOperationalIssue("warn", "cron/booking-lifecycle", "auto-complete skipped: no cleaner / payout owner for earnings", {
        bookingId: id,
      });
      continue;
    }

    try {
      const payout = await persistCleanerPayoutIfUnset({
        admin,
        bookingId: id,
        cleanerId: persistCleanerId,
      });
      if (!payout.ok) {
        await reportOperationalIssue("error", "cron/booking-lifecycle", `CRITICAL persist before auto-complete failed: ${payout.error}`, {
          bookingId: id,
          cleanerId: persistCleanerId,
        });
        continue;
      }
      const displayCents = await fetchBookingDisplayEarningsCents(admin, id);
      if (!isCompletableDisplayEarningsCents(displayCents)) {
        await reportOperationalIssue("error", "cron/booking-lifecycle", "CRITICAL display_earnings_cents not positive after persist (pre-complete)", {
          bookingId: id,
          cleanerId: persistCleanerId,
        });
        continue;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "cron/booking-lifecycle", `CRITICAL persist threw before auto-complete: ${msg}`, {
        bookingId: id,
        cleanerId: persistCleanerId,
      });
      continue;
    }

    const dispatchBefore =
      b && typeof b === "object" ? String((b as { dispatch_status?: string | null }).dispatch_status ?? "").trim() || null : null;
    const { patch: cronCompletionPatch } = buildCompletionCoherencePatch({
      beforeDispatchStatus: dispatchBefore,
      fillCompletedAtIfMissing: false,
      nowIso: completedAt,
    });
    const { error: upErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: completedAt, ...cronCompletionPatch })
      .eq("id", id);
    if (upErr) {
      await reportOperationalIssue("error", "cron/booking-lifecycle", `mark completed failed: ${upErr.message}`, {
        bookingId: id,
      });
      continue;
    }

    void ensureCleanerEarningsLedgerRow({ admin, bookingId: id });

    if (isBookingCompletedRouterEnabled()) {
      const event = buildBookingEvent({
        type: "booking.completed",
        bookingId: id,
        actor: "cron",
        externalRef: id,
        metadata: { source: "cron_auto_complete_past_date" },
      });
      void routeBookingNotificationEvent(event, { admin }).then((nav) => {
        if (!nav.ok) {
          void reportOperationalIssue(
            "warn",
            "cron/booking-lifecycle/routeBookingNotificationEvent(completed)",
            nav.message,
            { bookingId: id, code: nav.code },
          );
        }
      });
    } else {
      void notifyBookingEvent({ type: "completed", supabase: admin, bookingId: id });
    }

    try {
      const learn = await recordAssignmentOutcomeAndLearn(admin, id);
      if (!learn.ok) {
        void logSystemEvent({
          level: "info",
          source: "cron/booking-lifecycle",
          message: "marketplace_assignment_outcome_learn_skipped",
          context: { bookingId: id, error: learn.error ?? null },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("warn", "cron/booking-lifecycle", `marketplace outcome learn: ${msg}`, {
        bookingId: id,
      });
    }

    const { error: insEv } = await admin.from("user_events").insert({
      user_id: uid,
      event_type: "booking_completed",
      booking_id: id,
      payload: {},
    });
    if (insEv && insEv.code !== "23505") {
      await reportOperationalIssue("warn", "cron/booking-lifecycle", `booking_completed event insert: ${insEv.message}`, {
        bookingId: id,
      });
    }

    await completeCleanerReferralOnFirstJob({
      admin,
      cleanerId,
    });

    await syncCleanersBusyAfterBookingTerminalChange(admin, [cleanerId, persistCleanerId]);

    if (dateYmd && rawEmail.trim().length >= 3) {
      const recurringRow = b as {
        recurring_id?: string | null;
        is_recurring_generated?: boolean | null;
      };
      const rebookEligible = await evaluateRebookEligibility({
        supabase: admin,
        userId: uid,
        customerEmail: rawEmail,
        excludeBookingId: id,
        recurringId: typeof recurringRow.recurring_id === "string" ? recurringRow.recurring_id : null,
        isRecurringGenerated: recurringRow.is_recurring_generated,
      });
      if (!rebookEligible.eligible) {
        void logSystemEvent({
          level: "info",
          source: "cron/booking-lifecycle",
          message: "lifecycle.rebook_reminder.not_scheduled",
          context: { bookingId: id, userId: uid, skipReason: rebookEligible.reason },
        });
      } else {
        const reminderDay = addDaysToYmd(dateYmd, 14);
        const scheduledFor = johannesburgNineAmIso(reminderDay);
        const em = normalizeEmail(rawEmail);
        const { error: rebookErr } = await admin.from("booking_lifecycle_jobs").insert({
          booking_id: id,
          user_id: uid,
          customer_email: em,
          job_type: "rebook_reminder",
          scheduled_for: scheduledFor,
          status: "pending",
          attempts: 0,
          payload: { source: "post_completion", anchor_date: dateYmd },
        });
        if (rebookErr && rebookErr.code !== "23505") {
          await reportOperationalIssue("warn", "cron/booking-lifecycle", `rebook_reminder insert: ${rebookErr.message}`, {
            bookingId: id,
          });
        }
      }
    }

    completed++;
  }

  return { completed };
}

/**
 * Vercel Cron / pg_net: GET or POST with Bearer or x-cron-secret.
 * Processes pending lifecycle emails due now (status=pending, scheduled_for <= now).
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

  /* H-15: serialize lifecycle ticks — duplicate runs would race to mark the same past-date
   * bookings completed and dispatch duplicate notifications + payout snapshots. */
  const lockAcq = await acquireCronLock(supabase, {
    jobName: CRON_LOCK_KEYS.bookingLifecycle,
    leaseSeconds: 1200,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  try {
  const started = new Date().toISOString();
  await logSystemEvent({
    level: "info",
    source: "cron/booking-lifecycle",
    message: "Cron started",
    context: { started },
  });

  const complete = await markPastBookingsCompleted();

  const { data: jobs, error: jobErr } = await supabase
    .from("booking_lifecycle_jobs")
    .select("id, job_type, customer_email, booking_id, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_JOBS);

  if (jobErr) {
    await reportOperationalIssue("error", "cron/booking-lifecycle", `load lifecycle jobs: ${jobErr.message}`);
    await logSystemEvent({
      level: "error",
      source: "cron/booking-lifecycle",
      message: jobErr.message,
      context: {},
    });
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  let sent = 0;
  let retry = 0;
  let terminal = 0;
  let skipped = 0;

  for (const row of jobs ?? []) {
    const r = await processLifecycleJob(supabase, row as LifecycleJobRow);
    if (r === "sent") sent++;
    else if (r === "retry") retry++;
    else if (r === "terminal") terminal++;
    else skipped++;
  }

  const finished = new Date().toISOString();
  await logSystemEvent({
    level: "info",
    source: "cron/booking-lifecycle",
    message: "Cron finished",
    context: {
      started,
      finished,
      pastBookingsMarkedCompleted: complete.completed,
      lifecycleEmailsSent: sent,
      deferredRetry: retry,
      terminalFailures: terminal,
      skipped,
      batchSize: jobs?.length ?? 0,
    },
  });

  await logCronRun({
    jobName: "booking-lifecycle",
    status: "success",
    message: `completed=${complete.completed} lifecycle_sent=${sent}`,
    context: {
      pastBookingsMarkedCompleted: complete.completed,
      lifecycleEmailsSent: sent,
      deferredRetry: retry,
      terminalFailures: terminal,
      skipped,
      processed: jobs?.length ?? 0,
    },
  });

  try {
    await evaluateLifecycleEmailAlerts(supabase);
  } catch {
    /* best-effort monitoring */
  }

  return NextResponse.json({
    ok: true,
    pastBookingsMarkedCompleted: complete.completed,
    lifecycleEmailsSent: sent,
    deferredRetry: retry,
    terminalFailures: terminal,
    skipped,
    processed: jobs?.length ?? 0,
  });
  } finally {
    await releaseCronLock(supabase, lockAcq.jobName, lockAcq.holderId);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
