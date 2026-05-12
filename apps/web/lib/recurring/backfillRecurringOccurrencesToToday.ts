import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { compareYmd, lastDayYmdOfInvoiceMonth, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { calculateNextRunDate, occurrenceDatesInclusive, type RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";
import { computeInitialRecurringChargeAttemptAt } from "@/lib/recurring/computeInitialChargeAttemptAt";
import {
  generateMonthlyRecurringOccurrenceBooking,
  generateRecurringOccurrenceBooking,
  refreshRecurringBookingPaymentState,
} from "@/lib/booking/bookingOperations";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/** Safety cap per request (one calendar month is ≤31 days; cap allows multi-month if window widens later). */
export const RECURRING_BACKFILL_MAX_DATES = 400;

export type BackfillRecurringOccurrencesOptions = {
  /**
   * `YYYY-MM` — materialize that Africa/Johannesburg calendar month (default: month of {@link todayJohannesburg}).
   * Use after month rollover to repair gaps left by the legacy generator (e.g. `2026-05` in June).
   */
  invoiceMonthYm?: string;
};

export type BackfillRecurringOccurrencesResult = {
  ok: true;
  recurring_id: string;
  today: string;
  /** `YYYY-MM` window used for this run. */
  invoice_month_ym: string;
  from_ymd: string;
  through_ymd: string;
  dates_considered: number;
  truncated: boolean;
  generated: number;
  skipped_duplicate: number;
  skipped_other: number;
  failures: { date: string; error: string }[];
  next_run_date: string;
  /** Same as first day of `invoice_month_ym` (kept name for admin API compatibility). */
  campaign_floor_ymd: string;
};

/**
 * Creates **recurring-only** occurrence `bookings` for schedule dates in one **Johannesburg calendar month**:
 * `fromYmd = max(month_start, start_date)`, `throughYmd = min(month_end, end_date)` — same window as
 * `generate-recurring-bookings`. Existing plan + date rows are skipped (`duplicate_occurrence`).
 * Updates `next_run_date` like the generator (`calculateNextRunDate` from `through_ymd` when not truncated).
 */
export async function backfillRecurringOccurrencesToToday(
  admin: SupabaseClient,
  recurringId: string,
  options?: BackfillRecurringOccurrencesOptions,
): Promise<
  | BackfillRecurringOccurrencesResult
  | { ok: false; error: string; billing_type?: string; status?: string }
> {
  const id = recurringId.trim();
  if (!id) return { ok: false, error: "Missing recurring id." };

  const { data: raw, error: loadErr } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, next_run_date, status, skip_next_occurrence_date, booking_snapshot_template, monthly_pattern, monthly_nth, preferred_cleaner_id",
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
    /** M-6: nullable; backfill forwards as-is into the insert helpers' resolution chain. */
    preferred_cleaner_id?: string | null;
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
  const rawYm = options?.invoiceMonthYm?.trim() ?? today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(rawYm)) {
    return { ok: false, error: "Invalid invoice month (use YYYY-MM)." };
  }
  const invoiceMonthYm = rawYm;
  const monthStart = `${invoiceMonthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  const fromYmd = compareYmd(monthStart, r.start_date) >= 0 ? monthStart : r.start_date;
  const throughYmd = r.end_date && compareYmd(r.end_date, monthEnd) < 0 ? r.end_date : monthEnd;

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
      invoice_month_ym: invoiceMonthYm,
      from_ymd: fromYmd,
      through_ymd: throughYmd,
      dates_considered: 0,
      truncated: false,
      generated: 0,
      skipped_duplicate: 0,
      skipped_other: 0,
      failures: [],
      next_run_date: nextRun,
      campaign_floor_ymd: monthStart,
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
      const { bookingId, data } = ins;
      const paystackReference = data.paystackReference;
      generated++;
      if (!useMonthlyInvoicePath) {
        const smartAt = await computeInitialRecurringChargeAttemptAt(admin, {
          bookingId,
          customerEmail: email,
          customerPhone: customerPhone,
        });
        if (smartAt) {
          await admin.from("bookings").update({ recurring_next_charge_attempt_at: smartAt }).eq("id", bookingId);
        }
      }
      await refreshRecurringBookingPaymentState({ admin, bookingId });
      await logSystemEvent({
        level: "info",
        source: "admin/recurring/backfill",
        message: useMonthlyInvoicePath ? "monthly_invoice_recurring_booking_generated" : "recurring_booking_generated",
        context: {
          recurring_id: r.id,
          booking_id: bookingId,
          occurrence_date: d,
          paystack_reference: paystackReference,
          monthly_invoice: useMonthlyInvoicePath,
          billing_type: billingType,
          schedule_type: scheduleType,
        },
      });
    } else if (ins.code === "duplicate_occurrence") {
      skippedDuplicate++;
    } else {
      skippedOther++;
      if (failures.length < 30) failures.push({ date: d, error: ins.message });
    }
  }

  const nextRun = truncated ? datesAll[RECURRING_BACKFILL_MAX_DATES]! : calculateNextRunDate(schedule, throughYmd);

  await persistPlannerTail(nextRun);

  return {
    ok: true,
    recurring_id: r.id,
    today,
    invoice_month_ym: invoiceMonthYm,
    from_ymd: fromYmd,
    through_ymd: throughYmd,
    dates_considered: dates.length,
    truncated,
    generated,
    skipped_duplicate: skippedDuplicate,
    skipped_other: skippedOther,
    failures,
    next_run_date: nextRun,
    campaign_floor_ymd: monthStart,
  };
}
