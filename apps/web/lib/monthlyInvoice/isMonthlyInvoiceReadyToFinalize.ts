import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  compareYmd,
  isInvoiceMonthReadyToFinalize,
  lastDayYmdOfInvoiceMonth,
} from "@/lib/recurring/johannesburgCalendar";
import {
  expectedOccurrenceDatesForPlanInMonth,
  recurringPlanScheduleRowFromDb,
  type RecurringPlanScheduleRow,
} from "@/lib/recurring/reconcileRecurringPlanOccurrences";

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
      .eq("recurring_id", plan.id)
      .neq("status", "cancelled");
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
