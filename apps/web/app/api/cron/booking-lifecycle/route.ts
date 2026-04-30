import { NextResponse } from "next/server";
import { addDaysToYmd, johannesburgNineAmIso } from "@/lib/booking/dateYmdAddDays";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { processLifecycleJob, type LifecycleJobRow } from "@/lib/booking/processLifecycleJob";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { completeCleanerReferralOnFirstJob } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAssignmentOutcomeAndLearn } from "@/lib/marketplace-intelligence/assignmentOutcomeFeedback";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import {
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
  resolvePersistCleanerIdForBooking,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JOBS = 50;
const MAX_COMPLETE = 80;

async function markPastBookingsCompleted(): Promise<{ completed: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { completed: 0 };

  const today = todayYmdJohannesburg();
  const { data: past, error } = await admin
    .from("bookings")
    .select("id, user_id, cleaner_id, payout_owner_cleaner_id, is_team_job, date, status, customer_email")
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

    const uid = typeof b.user_id === "string" ? b.user_id : null;
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
      if (!hasPersistedDisplayEarningsBasis(displayCents)) {
        await reportOperationalIssue("error", "cron/booking-lifecycle", "CRITICAL display_earnings_cents still missing after persist (pre-complete)", {
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

    const { error: upErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", id);
    if (upErr) {
      await reportOperationalIssue("error", "cron/booking-lifecycle", `mark completed failed: ${upErr.message}`, {
        bookingId: id,
      });
      continue;
    }

    void notifyBookingEvent({ type: "completed", supabase: admin, bookingId: id });

    try {
      const learn = await recordAssignmentOutcomeAndLearn(admin, id);
      if (!learn.ok && process.env.NODE_ENV !== "production") {
        console.warn("[booking-lifecycle] marketplace outcome learn skipped", { bookingId: id, ...learn });
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

    if (dateYmd && rawEmail.trim().length >= 3) {
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

    completed++;
  }

  return { completed };
}

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Processes pending lifecycle emails due now (status=pending, scheduled_for <= now).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

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

  return NextResponse.json({
    ok: true,
    pastBookingsMarkedCompleted: complete.completed,
    lifecycleEmailsSent: sent,
    deferredRetry: retry,
    terminalFailures: terminal,
    skipped,
    processed: jobs?.length ?? 0,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
