import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  compareYmd,
  isInvoiceMonthReadyToFinalize,
  lastDayYmdOfInvoiceMonth,
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

function recurringPlanScheduleRowFromDb(raw: Record<string, unknown>): RecurringPlanScheduleRow {
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

function expectedOccurrenceDatesForPlanInMonth(
  plan: RecurringPlanScheduleRow,
  invoiceMonthYm: string,
): string[] {
  const schedule: RecurringScheduleRow = {
    frequency: plan.frequency,
    days_of_week: Array.isArray(plan.days_of_week) ? plan.days_of_week : [],
    start_date: plan.start_date,
    end_date: plan.end_date,
    monthly_pattern: plan.monthly_pattern ?? null,
    monthly_nth: typeof plan.monthly_nth === "number" ? plan.monthly_nth : null,
  };

  if (schedule.days_of_week.length === 0) return [];

  const monthStart = `${invoiceMonthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  const fromYmd = compareYmd(monthStart, plan.start_date) >= 0 ? monthStart : plan.start_date;
  const throughYmd =
    plan.end_date && compareYmd(plan.end_date, monthEnd) < 0 ? plan.end_date : monthEnd;

  if (compareYmd(fromYmd, throughYmd) > 0) return [];
  return occurrenceDatesInclusive(schedule, fromYmd, throughYmd);
}

export type MonthlyInvoiceFinalizeReadiness = {
  ready: boolean;
  reason?: string;
  lastVisitYmd: string | null;
  /** Set when `ready` — payment is expected from this date (usually today). */
  paymentDueDateYmd: string | null;
};

type BookingRow = {
  date: string;
  recurring_id: string | null;
  monthly_invoice_id: string | null;
};

/** Pure readiness check (exported for unit tests). */
export function evaluateMonthlyInvoiceFinalizeReadiness(input: {
  todayYmd: string;
  invoiceId: string;
  invoiceMonthYm: string;
  bookingsOnInvoice: BookingRow[];
  recurringPlans: RecurringPlanScheduleRow[];
  allBookingsByPlanId: Map<string, BookingRow[]>;
}): MonthlyInvoiceFinalizeReadiness {
  const inMonth = input.bookingsOnInvoice
    .map((b) => b.date)
    .filter((d) => d.startsWith(input.invoiceMonthYm));

  if (inMonth.length === 0) {
    return { ready: false, reason: "no_bookings", lastVisitYmd: null, paymentDueDateYmd: null };
  }

  const lastVisitYmd = inMonth.reduce((max, d) => (compareYmd(d, max) > 0 ? d : max));

  /**
   * On-demand / ad-hoc monthly (Airbnb turnovers, etc.): no active recurring plan for the
   * billing month — more visits can still be created later. Wait for calendar month-end.
   */
  if (input.recurringPlans.length === 0) {
    if (!isInvoiceMonthReadyToFinalize(input.todayYmd, input.invoiceMonthYm)) {
      return {
        ready: false,
        reason: "invoice_month_not_ended",
        lastVisitYmd,
        paymentDueDateYmd: null,
      };
    }
    return {
      ready: true,
      lastVisitYmd,
      paymentDueDateYmd: input.todayYmd,
    };
  }

  if (compareYmd(input.todayYmd, lastVisitYmd) < 0) {
    return {
      ready: false,
      reason: "upcoming_visits_in_month",
      lastVisitYmd,
      paymentDueDateYmd: null,
    };
  }

  for (const plan of input.recurringPlans) {
    const expected = expectedOccurrenceDatesForPlanInMonth(plan, input.invoiceMonthYm);
    if (expected.length === 0) continue;

    const planBookings = input.allBookingsByPlanId.get(plan.id) ?? [];
    const onInvoiceDates = new Set(
      planBookings
        .filter((b) => b.monthly_invoice_id === input.invoiceId)
        .map((b) => b.date),
    );

    for (const date of expected) {
      if (plan.skip_next_occurrence_date && date === plan.skip_next_occurrence_date) continue;
      if (!onInvoiceDates.has(date)) {
        return {
          ready: false,
          reason: "recurring_schedule_incomplete",
          lastVisitYmd,
          paymentDueDateYmd: null,
        };
      }
    }
  }

  return {
    ready: true,
    lastVisitYmd,
    paymentDueDateYmd: input.todayYmd,
  };
}

function planOverlapsInvoiceMonth(plan: RecurringPlanScheduleRow, invoiceMonthYm: string): boolean {
  const monthStart = `${invoiceMonthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  if (compareYmd(plan.start_date, monthEnd) > 0) return false;
  if (plan.end_date && compareYmd(plan.end_date, monthStart) < 0) return false;
  return true;
}

export async function assessMonthlyInvoiceFinalizeReadiness(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    customerId: string;
    month: string;
    todayYmd: string;
  },
): Promise<MonthlyInvoiceFinalizeReadiness> {
  const { data: invoiceBookings, error: invBookErr } = await admin
    .from("bookings")
    .select("date, recurring_id, monthly_invoice_id")
    .eq("monthly_invoice_id", params.invoiceId)
    .neq("status", "cancelled");

  if (invBookErr) {
    return {
      ready: false,
      reason: invBookErr.message,
      lastVisitYmd: null,
      paymentDueDateYmd: null,
    };
  }

  const bookingsOnInvoice = (invoiceBookings ?? []) as BookingRow[];

  const { data: planRows, error: planErr } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, booking_snapshot_template, preferred_cleaner_id, skip_next_occurrence_date, monthly_pattern, monthly_nth, status",
    )
    .eq("customer_id", params.customerId)
    .eq("status", "active");

  if (planErr) {
    return {
      ready: false,
      reason: planErr.message,
      lastVisitYmd: null,
      paymentDueDateYmd: null,
    };
  }

  const recurringPlans = (planRows ?? [])
    .map((raw) => recurringPlanScheduleRowFromDb(raw as Record<string, unknown>))
    .filter((plan) => planOverlapsInvoiceMonth(plan, params.month));

  const allBookingsByPlanId = new Map<string, BookingRow[]>();
  for (const plan of recurringPlans) {
    const { data: planBookings } = await admin
      .from("bookings")
      .select("date, recurring_id, monthly_invoice_id")
      .eq("recurring_id", plan.id);
    // A cancelled scheduled occurrence still proves that the occurrence existed
    // and was intentionally resolved. It should not make the month look
    // perpetually incomplete or require a replacement booking.
    allBookingsByPlanId.set(plan.id, (planBookings ?? []) as BookingRow[]);
  }

  return evaluateMonthlyInvoiceFinalizeReadiness({
    todayYmd: params.todayYmd,
    invoiceId: params.invoiceId,
    invoiceMonthYm: params.month,
    bookingsOnInvoice,
    recurringPlans,
    allBookingsByPlanId,
  });
}

/** Last scheduled visit on a draft invoice (for Zoho due date while still open). */
export function lastScheduledVisitYmd(
  invoiceMonthYm: string,
  bookingDates: string[],
): string | null {
  const inMonth = bookingDates.filter((d) => d.startsWith(invoiceMonthYm));
  if (inMonth.length === 0) return null;
  return inMonth.reduce((max, d) => (compareYmd(d, max) > 0 ? d : max));
}
