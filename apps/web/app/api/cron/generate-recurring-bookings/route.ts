import { NextResponse } from "next/server";
import { todayJohannesburg, compareYmd } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate, occurrenceDatesInclusive, type RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";
import { computeInitialRecurringChargeAttemptAt } from "@/lib/recurring/computeInitialChargeAttemptAt";
import { insertRecurringOccurrenceBooking } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { insertMonthlyRecurringOccurrenceBooking } from "@/lib/recurring/insertMonthlyRecurringOccurrenceBooking";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun, logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECURRING = 200;
/** Cap new occurrences processed per plan per cron invocation (backlog safety). */
const MAX_OCCURRENCES_PER_PLAN = 3;

/**
 * Cron: `verifyCronSecret` — `Authorization: Bearer CRON_SECRET` or `x-cron-secret` (Supabase pg_net).
 * Generates `pending_payment` bookings from active `recurring_bookings` (Africa/Johannesburg dates).
 *
 * Schedule: e.g. Supabase pg_cron every 10 minutes → POST this route (see migration `20260910_supabase_cron_recurring_bookings_http.sql`).
 */
export async function POST(request: Request) {
  const cronAuth = verifyCronSecret(request);
  if (!cronAuth.ok) {
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: cronAuth.body.error,
    });
    return NextResponse.json(cronAuth.body, { status: cronAuth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: "Supabase not configured.",
    });
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  let generated = 0;
  let skipped = 0;

  try {
  const today = todayJohannesburg();
  const { data: rows, error } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, next_run_date, status, skip_next_occurrence_date, booking_snapshot_template, monthly_pattern, monthly_nth",
    )
    .eq("status", "active")
    .lte("next_run_date", today)
    .limit(MAX_RECURRING);

  if (error) {
    await reportOperationalIssue("error", "cron/generate-recurring-bookings", error.message);
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: error.message,
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

    const fromYmd =
      compareYmd(r.next_run_date, r.start_date) < 0 ? r.start_date : r.next_run_date;
    const throughYmd = r.end_date && compareYmd(r.end_date, today) < 0 ? r.end_date : today;

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

    const { data: profileRow } = await admin
      .from("user_profiles")
      .select("billing_type, schedule_type")
      .eq("id", r.customer_id)
      .maybeSingle();
    const billingType = String((profileRow as { billing_type?: string } | null)?.billing_type ?? "per_booking");
    const scheduleType = String((profileRow as { schedule_type?: string } | null)?.schedule_type ?? "on_demand");

    if (billingType === "monthly" && scheduleType === "on_demand") {
      await logSystemEvent({
        level: "warn",
        source: "cron/generate-recurring-bookings",
        message: "recurring_skip_monthly_on_demand",
        context: { recurring_id: r.id, customer_id: r.customer_id },
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

    const useMonthlyInvoicePath = billingType === "monthly" && scheduleType === "fixed_schedule";

    const datesAll = occurrenceDatesInclusive(schedule, fromYmd, throughYmd);
    const dates = datesAll.slice(0, MAX_OCCURRENCES_PER_PLAN);
    const partialBacklog = datesAll.length > dates.length;

    for (const d of dates) {
      if (r.skip_next_occurrence_date && d === r.skip_next_occurrence_date) continue;

      const ins = useMonthlyInvoicePath
        ? await insertMonthlyRecurringOccurrenceBooking(admin, {
            recurring: {
              id: r.id,
              customer_id: r.customer_id,
              price: r.price,
              booking_snapshot_template: r.booking_snapshot_template,
            },
            occurrenceDateYmd: d,
            customerEmail: email,
            customerName: customerName,
            customerPhone: customerPhone,
          })
        : await insertRecurringOccurrenceBooking(admin, {
            recurring: {
              id: r.id,
              customer_id: r.customer_id,
              price: r.price,
              booking_snapshot_template: r.booking_snapshot_template,
            },
            occurrenceDateYmd: d,
            customerEmail: email,
            customerName: customerName,
            customerPhone: customerPhone,
          });

      if (ins.ok) {
        generated++;
        if (!useMonthlyInvoicePath) {
          const smartAt = await computeInitialRecurringChargeAttemptAt(admin, {
            bookingId: ins.bookingId,
            customerEmail: email,
            customerPhone: customerPhone,
          });
          if (smartAt) {
            await admin.from("bookings").update({ recurring_next_charge_attempt_at: smartAt }).eq("id", ins.bookingId);
          }
        }
        await refreshRecurringPaymentStateForBooking(admin, ins.bookingId);
        await logSystemEvent({
          level: "info",
          source: "cron/generate-recurring-bookings",
          message: useMonthlyInvoicePath ? "monthly_invoice_recurring_booking_generated" : "recurring_booking_generated",
          context: {
            recurring_id: r.id,
            booking_id: ins.bookingId,
            occurrence_date: d,
            paystack_reference: ins.paystackReference,
            monthly_invoice: useMonthlyInvoicePath,
          },
        });
      } else if (ins.error === "duplicate_occurrence") {
        skipped++;
      } else {
        await logSystemEvent({
          level: "warn",
          source: "cron/generate-recurring-bookings",
          message: "recurring_booking_generate_failed",
          context: { recurring_id: r.id, occurrence_date: d, error: ins.error },
        });
        skipped++;
      }
    }

    const nextRun = partialBacklog
      ? datesAll[MAX_OCCURRENCES_PER_PLAN]!
      : calculateNextRunDate(schedule, today);
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
    context: { scanned: rows?.length ?? 0, generated, skipped, today },
  });
  await logCronRun({
    jobName: "generate-recurring-bookings",
    status: "success",
    message: JSON.stringify({ scanned: rows?.length ?? 0, generated, skipped, today }),
  });

  return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, generated, skipped, today });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "cron/generate-recurring-bookings", msg);
    await logCronRun({
      jobName: "generate-recurring-bookings",
      status: "error",
      message: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
