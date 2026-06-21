import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchBookingCancelledNotifications } from "@/lib/notifications/bookingCancelledNotifications";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  generateMonthlyRecurringOccurrenceBooking,
  generateRecurringOccurrenceBooking,
} from "@/lib/booking/bookingOperations";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import {
  compareYmd,
  lastDayYmdOfInvoiceMonth,
  todayJohannesburg,
} from "@/lib/recurring/johannesburgCalendar";
import {
  occurrenceDatesInclusive,
  type MonthlyPattern,
  type RecurringScheduleRow,
} from "@/lib/recurring/calculateNextRunDate";

export type RecurringPlanScheduleRow = RecurringScheduleRow & {
  id: string;
  customer_id: string;
  price: number | string;
  booking_snapshot_template: unknown;
  preferred_cleaner_id?: string | null;
  skip_next_occurrence_date?: string | null;
  monthly_pattern?: MonthlyPattern | null;
  monthly_nth?: number | null;
};

export type ReconcileRecurringPlanResult = {
  months_reconciled: number;
  bookings_cancelled: number;
  bookings_created: number;
  bookings_cancel_skipped: number;
  bookings_cancel_skipped_locked_invoice: number;
  bookings_cancel_skipped_locked_payout: number;
  invoice_ids: string[];
  errors: string[];
};

type OccurrenceBookingRow = {
  id: string;
  date: string;
  status: string | null;
  cleaner_line_earnings_finalized_at: string | null;
  monthly_invoice_id: string | null;
  invoice_status: string | null;
  invoice_month: string | null;
};

function parseBookingInvoiceJoin(raw: Record<string, unknown>): {
  invoice_status: string | null;
  invoice_month: string | null;
} {
  const invJoin = raw.monthly_invoices;
  if (invJoin && typeof invJoin === "object" && !Array.isArray(invJoin)) {
    const inv = invJoin as { status?: unknown; month?: unknown };
    return {
      invoice_status: String(inv.status ?? "") || null,
      invoice_month: inv.month != null ? String(inv.month) : null,
    };
  }
  return { invoice_status: null, invoice_month: null };
}

function rowToOccurrenceBooking(raw: Record<string, unknown>): OccurrenceBookingRow | null {
  const date = String(raw.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const { invoice_status, invoice_month } = parseBookingInvoiceJoin(raw);
  return {
    id: String(raw.id ?? ""),
    date,
    status: raw.status != null ? String(raw.status) : null,
    cleaner_line_earnings_finalized_at:
      raw.cleaner_line_earnings_finalized_at != null
        ? String(raw.cleaner_line_earnings_finalized_at)
        : null,
    monthly_invoice_id: raw.monthly_invoice_id != null ? String(raw.monthly_invoice_id) : null,
    invoice_status,
    invoice_month,
  };
}

export function reconcileMonthsForPlan(
  planStartDate: string,
  planEndDate: string | null,
  existingBookings: OccurrenceBookingRow[],
  todayYm: string,
): string[] {
  const months = new Set<string>();
  months.add(todayYm);
  for (const booking of existingBookings) {
    months.add(booking.date.slice(0, 7));
    if (booking.invoice_month && booking.invoice_status?.trim().toLowerCase() === "draft") {
      months.add(booking.invoice_month);
    }
  }
  return [...months].sort().filter((invoiceMonthYm) => {
    const monthStart = `${invoiceMonthYm}-01`;
    const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
    const fromYmd = compareYmd(monthStart, planStartDate) >= 0 ? monthStart : planStartDate;
    const throughYmd =
      planEndDate && compareYmd(planEndDate, monthEnd) < 0 ? planEndDate : monthEnd;
    return compareYmd(fromYmd, throughYmd) <= 0;
  });
}

export function bookingsInReconcileMonth(
  existingBookings: OccurrenceBookingRow[],
  invoiceMonthYm: string,
  fromYmd: string,
  throughYmd: string,
): OccurrenceBookingRow[] {
  const inMonth: OccurrenceBookingRow[] = [];
  for (const booking of existingBookings) {
    const dateInRange = booking.date >= fromYmd && booking.date <= throughYmd;
    const onDraftInvoiceMonth =
      booking.invoice_month === invoiceMonthYm &&
      booking.invoice_status?.trim().toLowerCase() === "draft";
    if (dateInRange || onDraftInvoiceMonth) inMonth.push(booking);
  }
  return inMonth;
}

function isLockedInvoiceStatus(status: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "sent" || s === "paid" || s === "finalized";
}

function scheduleFromPlan(plan: RecurringPlanScheduleRow): RecurringScheduleRow {
  return {
    frequency: plan.frequency,
    days_of_week: Array.isArray(plan.days_of_week) ? plan.days_of_week : [],
    start_date: plan.start_date,
    end_date: plan.end_date,
    monthly_pattern:
      plan.monthly_pattern === "nth_weekday" ||
      plan.monthly_pattern === "last_weekday" ||
      plan.monthly_pattern === "mirror_start_date"
        ? plan.monthly_pattern
        : null,
    monthly_nth: typeof plan.monthly_nth === "number" ? plan.monthly_nth : null,
  };
}

/** Expected visit dates for a plan within a billing month (YYYY-MM). */
export function expectedOccurrenceDatesForPlanInMonth(
  plan: RecurringPlanScheduleRow,
  invoiceMonthYm: string,
): string[] {
  const schedule = scheduleFromPlan(plan);
  if (schedule.days_of_week.length === 0) return [];

  const monthStart = `${invoiceMonthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  const fromYmd = compareYmd(monthStart, plan.start_date) >= 0 ? monthStart : plan.start_date;
  const throughYmd =
    plan.end_date && compareYmd(plan.end_date, monthEnd) < 0 ? plan.end_date : monthEnd;
  if (compareYmd(fromYmd, throughYmd) > 0) return [];

  return occurrenceDatesInclusive(schedule, fromYmd, throughYmd);
}

export type ReconcileOrphanCancelBlockReason = "already_cancelled" | "locked_invoice";

/** Hard blocks only — draft-invoice orphans may still have earnings or completed status. */
export function reconcileOrphanCancelBlockReason(
  row: OccurrenceBookingRow,
): ReconcileOrphanCancelBlockReason | null {
  const st = (row.status ?? "").trim().toLowerCase();
  if (st === "cancelled") return "already_cancelled";
  if (row.monthly_invoice_id && isLockedInvoiceStatus(row.invoice_status)) {
    return "locked_invoice";
  }
  return null;
}

async function cancelReconcileOrphanBooking(
  admin: SupabaseClient,
  booking: OccurrenceBookingRow,
): Promise<
  | { ok: true }
  | { ok: false; reason: "locked_payout" | "cancel_failed"; message: string }
> {
  const safe = await assertBookingCleanerEarningsResetSafe(admin, booking.id);
  if (!safe.ok) {
    return { ok: false, reason: "locked_payout", message: safe.error };
  }

  // Cancel + clear booking earnings in one update so completed rows never violate
  // bookings_completed_requires_display_earnings (reset-before-cancel would null earnings while still completed).
  const { error: cancelErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_by: "system",
      display_earnings_cents: null,
      cleaner_earnings_total_cents: null,
      cleaner_line_earnings_finalized_at: null,
    })
    .eq("id", booking.id);

  if (cancelErr) {
    return { ok: false, reason: "cancel_failed", message: cancelErr.message };
  }

  const { error: liErr } = await admin
    .from("booking_line_items")
    .update({ cleaner_earnings_cents: null })
    .eq("booking_id", booking.id);
  if (liErr) {
    return { ok: false, reason: "cancel_failed", message: liErr.message };
  }

  const { error: ceErr } = await admin
    .from("cleaner_earnings")
    .delete()
    .eq("booking_id", booking.id)
    .eq("status", "pending");
  if (ceErr) {
    return { ok: false, reason: "cancel_failed", message: ceErr.message };
  }

  void dispatchBookingCancelledNotifications(admin, {
    bookingId: booking.id,
    cancellationReason: "Recurring plan occurrence reconciled (orphan cancelled)",
  });

  return { ok: true };
}

async function loadCustomerContext(admin: SupabaseClient, plan: RecurringPlanScheduleRow) {
  const userRes = await admin.auth.admin.getUserById(plan.customer_id);
  const email = normalizeEmail(String(userRes.data.user?.email ?? ""));
  if (!email) return { ok: false as const, error: "Customer has no email on auth account." };

  const meta = userRes.data.user?.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? String(meta.name).trim()
        : "";

  const tpl = plan.booking_snapshot_template;
  const customerName =
    nameFromMeta ||
    (() => {
      if (tpl && typeof tpl === "object" && tpl !== null && "customer" in tpl) {
        const c = (tpl as { customer?: { name?: string } }).customer;
        if (c?.name && typeof c.name === "string") return c.name.trim();
      }
      return null;
    })();

  const customerPhone = (() => {
    if (tpl && typeof tpl === "object" && tpl !== null && "customer" in tpl) {
      const c = (tpl as { customer?: { phone?: string } }).customer;
      if (c?.phone && typeof c.phone === "string") return c.phone.trim();
    }
    return typeof meta?.phone === "string" ? meta.phone.trim() : null;
  })();

  const { data: profileRow } = await admin
    .from("user_profiles")
    .select("billing_type")
    .eq("id", plan.customer_id)
    .maybeSingle();
  const billingType = String((profileRow as { billing_type?: string } | null)?.billing_type ?? "per_booking");

  return {
    ok: true as const,
    email,
    customerName,
    customerPhone,
    useMonthlyInvoicePath: billingType === "monthly",
  };
}

/**
 * Align generated occurrence rows with the plan schedule (e.g. weekly 2 days → 1 day).
 * Cancels orphan draft-invoice visits and creates missing dates for each billing month touched.
 */
export async function reconcileRecurringPlanOccurrences(
  admin: SupabaseClient,
  plan: RecurringPlanScheduleRow,
): Promise<ReconcileRecurringPlanResult> {
  const result: ReconcileRecurringPlanResult = {
    months_reconciled: 0,
    bookings_cancelled: 0,
    bookings_created: 0,
    bookings_cancel_skipped: 0,
    bookings_cancel_skipped_locked_invoice: 0,
    bookings_cancel_skipped_locked_payout: 0,
    invoice_ids: [],
    errors: [],
  };

  const schedule = scheduleFromPlan(plan);
  if (schedule.days_of_week.length === 0) {
    result.errors.push("Plan has no weekdays configured.");
    return result;
  }

  const customer = await loadCustomerContext(admin, plan);
  if (!customer.ok) {
    result.errors.push(customer.error);
    return result;
  }

  const { data: existingRows, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, date, status, cleaner_line_earnings_finalized_at, monthly_invoice_id, monthly_invoices(status, month)",
    )
    .eq("recurring_id", plan.id)
    .neq("status", "cancelled");

  if (loadErr) {
    result.errors.push(loadErr.message);
    return result;
  }

  const existingBookings = (existingRows ?? [])
    .map((raw) => rowToOccurrenceBooking(raw as Record<string, unknown>))
    .filter((row): row is OccurrenceBookingRow => row != null);

  const months = reconcileMonthsForPlan(
    plan.start_date,
    plan.end_date,
    existingBookings,
    todayJohannesburg().slice(0, 7),
  );

  const invoiceIdSet = new Set<string>();

  for (const invoiceMonthYm of months) {
    const monthStart = `${invoiceMonthYm}-01`;
    const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
    const fromYmd = compareYmd(monthStart, plan.start_date) >= 0 ? monthStart : plan.start_date;
    const throughYmd =
      plan.end_date && compareYmd(plan.end_date, monthEnd) < 0 ? plan.end_date : monthEnd;

    const expectedDates = new Set(occurrenceDatesInclusive(schedule, fromYmd, throughYmd));
    const inMonth = bookingsInReconcileMonth(existingBookings, invoiceMonthYm, fromYmd, throughYmd);

    const existingDates = new Set(inMonth.map((b) => b.date));

    for (const booking of inMonth) {
      if (expectedDates.has(booking.date)) continue;

      const blockReason = reconcileOrphanCancelBlockReason(booking);
      if (blockReason === "locked_invoice") {
        result.bookings_cancel_skipped++;
        result.bookings_cancel_skipped_locked_invoice++;
        continue;
      }
      if (blockReason === "already_cancelled") continue;

      const cancelled = await cancelReconcileOrphanBooking(admin, booking);
      if (!cancelled.ok) {
        result.bookings_cancel_skipped++;
        if (cancelled.reason === "locked_payout") {
          result.bookings_cancel_skipped_locked_payout++;
        } else {
          result.errors.push(`Cancel ${booking.date}: ${cancelled.message}`);
        }
        continue;
      }

      result.bookings_cancelled++;
      existingDates.delete(booking.date);
      if (booking.monthly_invoice_id) invoiceIdSet.add(booking.monthly_invoice_id);
    }

    for (const date of expectedDates) {
      if (existingDates.has(date)) continue;
      if (plan.skip_next_occurrence_date && date === plan.skip_next_occurrence_date) continue;

      const recurringPayload = {
        id: plan.id,
        customer_id: plan.customer_id,
        price: plan.price,
        booking_snapshot_template: plan.booking_snapshot_template,
        preferred_cleaner_id: plan.preferred_cleaner_id ?? null,
      };

      const ins = customer.useMonthlyInvoicePath
        ? await generateMonthlyRecurringOccurrenceBooking({
            admin,
            recurring: recurringPayload,
            occurrenceDateYmd: date,
            customerEmail: customer.email,
            customerName: customer.customerName,
            customerPhone: customer.customerPhone,
          })
        : await generateRecurringOccurrenceBooking({
            admin,
            recurring: recurringPayload,
            occurrenceDateYmd: date,
            customerEmail: customer.email,
            customerName: customer.customerName,
            customerPhone: customer.customerPhone,
          });

      if (ins.ok) {
        result.bookings_created++;
        const { data: created } = await admin
          .from("bookings")
          .select("monthly_invoice_id")
          .eq("id", ins.bookingId)
          .maybeSingle();
        const invId = (created as { monthly_invoice_id?: string | null } | null)?.monthly_invoice_id;
        if (invId) invoiceIdSet.add(String(invId));
      } else if (ins.code !== "duplicate_occurrence") {
        result.errors.push(`Create ${date}: ${ins.message}`);
      }
    }

    result.months_reconciled++;
  }

  result.invoice_ids = [...invoiceIdSet];
  return result;
}

/** All draft monthly invoice ids linked to non-cancelled bookings on this recurring plan. */
export async function collectDraftInvoiceIdsForRecurringPlan(
  admin: SupabaseClient,
  recurringPlanId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("bookings")
    .select("monthly_invoice_id, monthly_invoices(status)")
    .eq("recurring_id", recurringPlanId)
    .neq("status", "cancelled")
    .not("monthly_invoice_id", "is", null);

  if (error) return [];

  const ids = new Set<string>();
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const invoiceId = row.monthly_invoice_id != null ? String(row.monthly_invoice_id) : "";
    if (!invoiceId) continue;
    const invJoin = row.monthly_invoices;
    if (invJoin && typeof invJoin === "object" && !Array.isArray(invJoin)) {
      const status = String((invJoin as { status?: unknown }).status ?? "").toLowerCase();
      if (status === "draft") ids.add(invoiceId);
    }
  }
  return [...ids];
}

export function recurringPlanScheduleChanged(patch: Record<string, unknown>): boolean {
  return (
    "days_of_week" in patch ||
    "frequency" in patch ||
    "start_date" in patch ||
    "end_date" in patch ||
    "monthly_pattern" in patch ||
    "monthly_nth" in patch
  );
}

export function recurringPlanScheduleRowFromDb(raw: Record<string, unknown>): RecurringPlanScheduleRow {
  const mp = raw.monthly_pattern;
  return {
    id: String(raw.id ?? ""),
    customer_id: String(raw.customer_id ?? ""),
    price: raw.price as number | string,
    frequency: raw.frequency as RecurringScheduleRow["frequency"],
    days_of_week: Array.isArray(raw.days_of_week) ? (raw.days_of_week as number[]) : [],
    start_date: String(raw.start_date ?? ""),
    end_date: raw.end_date != null ? String(raw.end_date) : null,
    monthly_pattern:
      mp === "nth_weekday" || mp === "last_weekday" || mp === "mirror_start_date" ? mp : null,
    monthly_nth: typeof raw.monthly_nth === "number" ? raw.monthly_nth : null,
    booking_snapshot_template: raw.booking_snapshot_template,
    preferred_cleaner_id: raw.preferred_cleaner_id != null ? String(raw.preferred_cleaner_id) : null,
    skip_next_occurrence_date:
      raw.skip_next_occurrence_date != null ? String(raw.skip_next_occurrence_date) : null,
  };
}
