import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { compareYmd, mayFirstOfSameYear, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate, occurrenceDatesInclusive, type RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";
import { computeInitialRecurringChargeAttemptAt } from "@/lib/recurring/computeInitialChargeAttemptAt";
import { insertMonthlyRecurringOccurrenceBooking } from "@/lib/recurring/insertMonthlyRecurringOccurrenceBooking";
import { insertRecurringOccurrenceBooking } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/** Safety cap per request (weekly ~52/yr; monthly fewer; avoids runaway CPU). */
export const RECURRING_BACKFILL_MAX_DATES = 400;

export type BackfillRecurringOccurrencesResult = {
  ok: true;
  recurring_id: string;
  today: string;
  from_ymd: string;
  through_ymd: string;
  dates_considered: number;
  truncated: boolean;
  generated: number;
  skipped_duplicate: number;
  skipped_other: number;
  failures: { date: string; error: string }[];
  next_run_date: string;
  /** Lower bound used for this run: 1 May of Johannesburg `today`’s year (later of that and plan `start_date`). */
  campaign_floor_ymd: string;
};

/**
 * Creates **recurring-only** occurrence `bookings` for schedule dates from **1 May (same year as Johannesburg
 * `today`)** through **today** inclusive — lower bound is `max(start_date, YYYY-05-01)`. Respects `end_date`.
 * Existing plan + date rows are skipped (`duplicate_occurrence`). Updates `next_run_date` so **`generate-recurring-bookings`**
 * cron continues normally afterward (same tail as generator).
 */
export async function backfillRecurringOccurrencesToToday(
  admin: SupabaseClient,
  recurringId: string,
): Promise<
  | BackfillRecurringOccurrencesResult
  | { ok: false; error: string; billing_type?: string; status?: string }
> {
  const id = recurringId.trim();
  if (!id) return { ok: false, error: "Missing recurring id." };

  const { data: raw, error: loadErr } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, next_run_date, status, skip_next_occurrence_date, booking_snapshot_template, monthly_pattern, monthly_nth",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return { ok: false, error: loadErr.message };
  if (!raw || typeof raw !== "object") return { ok: false, error: "Recurring plan not found." };

  const r = raw as {
    id: string;
    customer_id: string;
    price: number | string;
    frequency: RecurringScheduleRow["frequency"];
    days_of_week: number[];
    start_date: string;
    end_date: string | null;
    next_run_date: string;
    status: string;
    skip_next_occurrence_date: string | null;
    booking_snapshot_template: unknown;
    monthly_pattern?: string | null;
    monthly_nth?: number | null;
  };

  const st = String(r.status ?? "").toLowerCase();
  if (st !== "active") return { ok: false, error: "Only active plans can be backfilled.", status: r.status };

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

  const today = todayJohannesburg();
  const campaignFloor = mayFirstOfSameYear(today);
  const throughYmd = r.end_date && compareYmd(r.end_date, today) < 0 ? r.end_date : today;
  const fromYmd = compareYmd(r.start_date, campaignFloor) < 0 ? campaignFloor : r.start_date;

  const persistPlannerTail = async (nextRun: string) => {
    await admin
      .from("recurring_bookings")
      .update({
        last_generated_at: new Date().toISOString(),
        next_run_date: nextRun,
        skip_next_occurrence_date: null,
      })
      .eq("id", r.id);
  };

  if (compareYmd(fromYmd, throughYmd) > 0) {
    const nextRun = calculateNextRunDate(schedule, today);
    await persistPlannerTail(nextRun);
    return {
      ok: true,
      recurring_id: r.id,
      today,
      from_ymd: fromYmd,
      through_ymd: throughYmd,
      dates_considered: 0,
      truncated: false,
      generated: 0,
      skipped_duplicate: 0,
      skipped_other: 0,
      failures: [],
      next_run_date: nextRun,
      campaign_floor_ymd: campaignFloor,
    };
  }

  const datesAll = occurrenceDatesInclusive(schedule, fromYmd, throughYmd);
  const truncated = datesAll.length > RECURRING_BACKFILL_MAX_DATES;
  const dates = truncated ? datesAll.slice(0, RECURRING_BACKFILL_MAX_DATES) : datesAll;

  const userRes = await admin.auth.admin.getUserById(r.customer_id);
  const email = normalizeEmail(String(userRes.data.user?.email ?? ""));
  if (!email) return { ok: false, error: "Customer has no email on auth account; cannot create bookings." };

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

  const customerPhone = (() => {
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

  if (billingType !== "per_booking" && billingType !== "monthly") {
    return { ok: false, error: "Unsupported billing_type for recurring generation.", billing_type: billingType };
  }

  const useMonthlyInvoicePath = billingType === "monthly";

  let generated = 0;
  let skippedDuplicate = 0;
  let skippedOther = 0;
  const failures: { date: string; error: string }[] = [];

  for (const d of dates) {
    if (r.skip_next_occurrence_date && d === r.skip_next_occurrence_date) {
      skippedOther++;
      continue;
    }

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
        source: "admin/recurring/backfill",
        message: useMonthlyInvoicePath ? "monthly_invoice_recurring_booking_generated" : "recurring_booking_generated",
        context: {
          recurring_id: r.id,
          booking_id: ins.bookingId,
          occurrence_date: d,
          paystack_reference: ins.paystackReference,
          monthly_invoice: useMonthlyInvoicePath,
          billing_type: billingType,
          schedule_type: scheduleType,
        },
      });
    } else if (ins.error === "duplicate_occurrence") {
      skippedDuplicate++;
    } else {
      skippedOther++;
      if (failures.length < 30) failures.push({ date: d, error: ins.error });
    }
  }

  const nextRun = truncated
    ? datesAll[RECURRING_BACKFILL_MAX_DATES]!
    : calculateNextRunDate(schedule, today);

  await persistPlannerTail(nextRun);

  return {
    ok: true,
    recurring_id: r.id,
    today,
    from_ymd: fromYmd,
    through_ymd: throughYmd,
    dates_considered: dates.length,
    truncated,
    generated,
    skipped_duplicate: skippedDuplicate,
    skipped_other: skippedOther,
    failures,
    next_run_date: nextRun,
    campaign_floor_ymd: campaignFloor,
  };
}
