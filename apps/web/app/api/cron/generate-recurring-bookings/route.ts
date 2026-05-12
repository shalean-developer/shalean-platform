import { NextResponse } from "next/server";
import {
  addDaysYmd,
  todayJohannesburg,
  compareYmd,
  lastDayYmdOfInvoiceMonth,
} from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate, occurrenceDatesInclusive, type RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";
import { computeInitialRecurringChargeAttemptAt } from "@/lib/recurring/computeInitialChargeAttemptAt";
import {
  generateMonthlyRecurringOccurrenceBooking,
  generateRecurringOccurrenceBooking,
  refreshRecurringBookingPaymentState,
} from "@/lib/booking/bookingOperations";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun, logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECURRING = 200;
/** Cap new occurrences processed per plan per cron invocation (backlog safety; ≥ max days per month). */
const MAX_OCCURRENCES_PER_PLAN = 35;

/**
 * Cron: `verifyCronSecret` — `Authorization: Bearer CRON_SECRET` or `x-cron-secret` (Supabase pg_net).
 * Generates occurrence rows from active `recurring_bookings` (Africa/Johannesburg dates):
 * - `per_booking`: `pending_payment` + Paystack auto-charge path
 * - `monthly`: `pending` + `pending_monthly` + draft `monthly_invoices` attach (no immediate charge)
 *
 * `user_profiles.schedule_type` (`fixed_schedule` | `on_demand`) does **not** gate generation — both receive
 * spawned visits; monthly collection runs via `/api/cron/charge-monthly-invoices` (finalize + Paystack link).
 *
 * Generation window: **current calendar month** (Africa/Johannesburg), capped by `end_date`.
 * Floor: `fromYmd = max(month_start, start_date)` so the whole month is reconciled (e.g. weekly from 1 May → all
 * May visits). Existing rows stay aligned: duplicate dates return `duplicate_occurrence` and are skipped.
 * Queued when `next_run_date <= month_end + 28d` (cursor may sit in early next month after the old generator);
 * plan must overlap this month (`start_date <= month_end`, `end_date` null or `>= month_start`). `next_run_date`
 * is not used as the window floor for which dates to try.
 *
 * Schedule: e.g. Supabase pg_cron every 10 minutes → POST this route (see migration `20260910_supabase_cron_recurring_bookings_http.sql`).
 */
export async function POST(request: Request) {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    // Do not record 401 in cron_runs — probes / missing Bearer skew health metrics; 503 is real misconfiguration.
    if (cronAuth.status !== 401) {
      await logCronRun({
        jobName: "generate-recurring-bookings",
        status: "error",
        message: `[auth] ${cronAuth.body.error}`,
      });
    }
    return NextResponse.json(cronAuth.body, { status: cronAuth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: "[env] Supabase not configured.",
    });
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  /* H-15: serialize recurring generation — duplicate runs would attempt to create the same
   * occurrence rows in parallel. The booking unique-index dedups inserts, but cursor advancement,
   * smart-charge attempt scheduling, and downstream side effects must run at most once. */
  const lockAcq = await acquireCronLock(admin, {
    jobName: CRON_LOCK_KEYS.generateRecurringBookings,
    leaseSeconds: 1200,
  });
  if (!lockAcq.ok) {
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "success",
      message: JSON.stringify({ skipped: true, reason: lockAcq.reason }),
    });
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  let generated = 0;
  let skipped = 0;

  try {
  const today = todayJohannesburg();
  const monthYm = today.slice(0, 7);
  const monthStart = `${monthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(monthYm);
  /** Include plans whose cursor already moved into the next calendar month (legacy behaviour); still bounded. */
  const cursorEligibilityEnd = addDaysYmd(monthEnd, 28);
  const { data: rows, error } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, next_run_date, status, skip_next_occurrence_date, booking_snapshot_template, monthly_pattern, monthly_nth, preferred_cleaner_id",
    )
    .eq("status", "active")
    .lte("start_date", monthEnd)
    .or(`end_date.is.null,end_date.gte.${monthStart}`)
    .lte("next_run_date", cursorEligibilityEnd)
    .limit(MAX_RECURRING);

  if (error) {
    await reportOperationalIssue("error", "cron/generate-recurring-bookings", error.message);
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: `[recurring_bookings_select] ${error.message}`,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const raw of rows ?? []) {
    const r = raw as {
      id: string;
      customer_id: string;
      price: number | string;
      frequency: RecurringScheduleRow["frequency"];
      days_of_week: number[];
      start_date: string;
      end_date: string | null;
      next_run_date: string;
      skip_next_occurrence_date: string | null;
      booking_snapshot_template: unknown;
      monthly_pattern?: string | null;
      monthly_nth?: number | null;
      /** M-6: nullable; cron forwards as-is into the insert helpers' resolution chain. */
      preferred_cleaner_id?: string | null;
    };

    const schedule: RecurringScheduleRow = {
      frequency: r.frequency,
      days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week : [],
      start_date: r.start_date,
      end_date: r.end_date,
      monthly_pattern:
        r.monthly_pattern === "nth_weekday" || r.monthly_pattern === "last_weekday" || r.monthly_pattern === "mirror_start_date"
          ? r.monthly_pattern
          : null,
      monthly_nth: typeof r.monthly_nth === "number" ? r.monthly_nth : null,
    };

    /** Full current month from calendar day 1 (or plan start), not `next_run_date` — avoids gaps vs already-inserted rows. */
    const fromYmd = compareYmd(monthStart, r.start_date) >= 0 ? monthStart : r.start_date;
    const throughYmd =
      r.end_date && compareYmd(r.end_date, monthEnd) < 0 ? r.end_date : monthEnd;

    if (compareYmd(fromYmd, throughYmd) > 0) {
      const nextRun = calculateNextRunDate(schedule, today);
      await admin.from("recurring_bookings").update({ last_generated_at: new Date().toISOString(), next_run_date: nextRun }).eq("id", r.id);
      skipped++;
      continue;
    }

    const userRes = await admin.auth.admin.getUserById(r.customer_id);
    const email = normalizeEmail(String(userRes.data.user?.email ?? ""));
    if (!email) {
      await logSystemEvent({
        level: "warn",
        source: "cron/generate-recurring-bookings",
        message: "recurring_skip_no_email",
        context: { recurring_id: r.id, customer_id: r.customer_id },
      });
      skipped++;
      continue;
    }

    const meta = userRes.data.user?.user_metadata as Record<string, unknown> | undefined;
    const nameFromMeta =
      typeof meta?.full_name === "string"
        ? meta.full_name.trim()
        : typeof meta?.name === "string"
          ? String(meta.name).trim()
          : "";
    const customerName =
      nameFromMeta ||
      (() => {
        const tpl = r.booking_snapshot_template;
        if (tpl && typeof tpl === "object" && tpl !== null && "customer" in tpl) {
          const c = (tpl as { customer?: { name?: string } }).customer;
          if (c?.name && typeof c.name === "string") return c.name.trim();
        }
        return null;
      })();

    const customerPhone =
      (() => {
        const tpl = r.booking_snapshot_template;
        if (tpl && typeof tpl === "object" && tpl !== null && "customer" in tpl) {
          const c = (tpl as { customer?: { phone?: string } }).customer;
          if (c?.phone && typeof c.phone === "string") return c.phone.trim();
        }
        return typeof meta?.phone === "string" ? meta.phone.trim() : null;
      })();

    const { data: profileRow, error: profileErr } = await admin
      .from("user_profiles")
      .select("billing_type, schedule_type")
      .eq("id", r.customer_id)
      .maybeSingle();

    /*
     * H-6 / H-4 — never silently default a missing profile to `per_booking`.
     *
     * Pre-fix this code path read a missing `user_profiles` row as
     * `billing_type='per_booking'`, which silently routed monthly users to
     * the Paystack auto-charge generator path. After H-6 / H-4, every
     * customer-facing auth user must have a `user_profiles` row (created
     * server-side at create-from-guest / magic-link link, plus a one-shot
     * backfill in `20260939_*`). If this row is still missing here, treat
     * it as a hard data invariant break: do NOT generate occurrences for
     * this plan in this run, advance `next_run_date` to the safe rolling
     * cursor, and surface a loud operational warning so ops can repair
     * the profile rather than letting cents-cost bookings spawn under the
     * wrong billing rail. We also bail loudly when the SELECT errors —
     * a transient DB error must not be misread as "no row, default to
     * per_booking".
     */
    if (profileErr) {
      await reportOperationalIssue(
        "error",
        "cron/generate-recurring-bookings",
        `user_profiles_select_failed: ${profileErr.message}`,
      );
      await logSystemEvent({
        level: "error",
        source: "cron/generate-recurring-bookings",
        message: "recurring_skip_profile_select_failed",
        context: { recurring_id: r.id, customer_id: r.customer_id, error: profileErr.message },
      });
      skipped++;
      continue;
    }
    if (!profileRow) {
      await reportOperationalIssue(
        "error",
        "cron/generate-recurring-bookings",
        `recurring_skip_missing_profile: customer ${r.customer_id} has no user_profiles row`,
      );
      await logSystemEvent({
        level: "error",
        source: "cron/generate-recurring-bookings",
        message: "recurring_skip_missing_profile",
        context: {
          recurring_id: r.id,
          customer_id: r.customer_id,
          remediation:
            "Create user_profiles row (billing_type, schedule_type) for this auth user, then the next cron run will generate.",
        },
      });
      skipped++;
      const nextRun = calculateNextRunDate(schedule, today);
      await admin
        .from("recurring_bookings")
        .update({
          last_generated_at: new Date().toISOString(),
          next_run_date: nextRun,
          skip_next_occurrence_date: null,
        })
        .eq("id", r.id);
      continue;
    }

    const billingType = String((profileRow as { billing_type?: string }).billing_type ?? "per_booking");
    const scheduleType = String((profileRow as { schedule_type?: string }).schedule_type ?? "on_demand");

    /** Explicit supported billing kinds — extend here if new `billing_type` values ship in DB. */
    const shouldGenerateRecurringOccurrences =
      billingType === "per_booking" || billingType === "monthly";

    if (!shouldGenerateRecurringOccurrences) {
      await logSystemEvent({
        level: "warn",
        source: "cron/generate-recurring-bookings",
        message: "recurring_skip_unsupported_billing_type",
        context: {
          recurring_id: r.id,
          customer_id: r.customer_id,
          billing_type: billingType,
          schedule_type: scheduleType,
        },
      });
      skipped++;
      const nextRun = calculateNextRunDate(schedule, today);
      await admin
        .from("recurring_bookings")
        .update({
          last_generated_at: new Date().toISOString(),
          next_run_date: nextRun,
          skip_next_occurrence_date: null,
        })
        .eq("id", r.id);
      continue;
    }

    /** Monthly consolidated billing: deferred charge via `monthly_invoices` (see `generateMonthlyRecurringOccurrenceBooking`). */
    const useMonthlyInvoicePath = billingType === "monthly";

    const datesAll = occurrenceDatesInclusive(schedule, fromYmd, throughYmd);
    const dates = datesAll.slice(0, MAX_OCCURRENCES_PER_PLAN);
    const partialBacklog = datesAll.length > dates.length;

    for (const d of dates) {
      if (r.skip_next_occurrence_date && d === r.skip_next_occurrence_date) continue;

      const ins = useMonthlyInvoicePath
        ? await generateMonthlyRecurringOccurrenceBooking({
            admin,
            recurring: {
              id: r.id,
              customer_id: r.customer_id,
              price: r.price,
              booking_snapshot_template: r.booking_snapshot_template,
              preferred_cleaner_id: r.preferred_cleaner_id ?? null,
            },
            occurrenceDateYmd: d,
            customerEmail: email,
            customerName: customerName,
            customerPhone: customerPhone,
          })
        : await generateRecurringOccurrenceBooking({
            admin,
            recurring: {
              id: r.id,
              customer_id: r.customer_id,
              price: r.price,
              booking_snapshot_template: r.booking_snapshot_template,
              preferred_cleaner_id: r.preferred_cleaner_id ?? null,
            },
            occurrenceDateYmd: d,
            customerEmail: email,
            customerName: customerName,
            customerPhone: customerPhone,
          });

      if (ins.ok) {
        const newBookingId = ins.bookingId;
        const newPaystackReference = ins.data.paystackReference;
        generated++;
        if (useMonthlyInvoicePath) {
          console.log("[generate] created booking for monthly customer", {
            planId: r.id,
            date: d,
            bookingId: newBookingId,
          });
        } else {
          console.log("[generate] generated booking", { planId: r.id, date: d, bookingId: newBookingId });
        }
        if (!useMonthlyInvoicePath) {
          const smartAt = await computeInitialRecurringChargeAttemptAt(admin, {
            bookingId: newBookingId,
            customerEmail: email,
            customerPhone: customerPhone,
          });
          if (smartAt) {
            await admin.from("bookings").update({ recurring_next_charge_attempt_at: smartAt }).eq("id", newBookingId);
          }
        }
        await refreshRecurringBookingPaymentState({ admin, bookingId: newBookingId });
        await logSystemEvent({
          level: "info",
          source: "cron/generate-recurring-bookings",
          message: useMonthlyInvoicePath ? "monthly_invoice_recurring_booking_generated" : "recurring_booking_generated",
          context: {
            recurring_id: r.id,
            booking_id: newBookingId,
            occurrence_date: d,
            paystack_reference: newPaystackReference,
            monthly_invoice: useMonthlyInvoicePath,
            billing_type: billingType,
            schedule_type: scheduleType,
          },
        });
      } else if (ins.code === "duplicate_occurrence") {
        skipped++;
        console.log("[generate] skipped recurring duplicate", { planId: r.id, date: d });
      } else {
        await logSystemEvent({
          level: "warn",
          source: "cron/generate-recurring-bookings",
          message: "recurring_booking_generate_failed",
          context: { recurring_id: r.id, occurrence_date: d, error: ins.message },
        });
        skipped++;
      }
    }

    const nextRun = partialBacklog
      ? datesAll[MAX_OCCURRENCES_PER_PLAN]!
      : calculateNextRunDate(schedule, throughYmd);
    await admin
      .from("recurring_bookings")
      .update({
        last_generated_at: new Date().toISOString(),
        next_run_date: nextRun,
        skip_next_occurrence_date: null,
      })
      .eq("id", r.id);
  }

  await logSystemEvent({
    level: "info",
    source: "cron/generate-recurring-bookings",
    message: "Cron finished",
    context: {
      scanned: rows?.length ?? 0,
      generated,
      skipped,
      today,
      month_start: monthStart,
      month_end: monthEnd,
      cursor_eligibility_end: cursorEligibilityEnd,
    },
  });
  await logCronRun({
    jobName: "generate-recurring-bookings",
    status: "success",
    message: JSON.stringify({
      scanned: rows?.length ?? 0,
      generated,
      skipped,
      today,
      month_start: monthStart,
      month_end: monthEnd,
      cursor_eligibility_end: cursorEligibilityEnd,
    }),
  });

  return NextResponse.json({
    ok: true,
    scanned: rows?.length ?? 0,
    generated,
    skipped,
    today,
    month_start: monthStart,
    month_end: monthEnd,
    cursor_eligibility_end: cursorEligibilityEnd,
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "cron/generate-recurring-bookings", msg);
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: `[handler] ${msg}`,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(admin, lockAcq.jobName, lockAcq.holderId);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
