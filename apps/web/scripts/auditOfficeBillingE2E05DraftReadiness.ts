/**
 * OFFICE-BILLING-E2E-05 — read-only draft monthly invoice readiness audit.
 *
 * No writes. Classifies every current draft as:
 * - ZERO_CANCELLED_ONLY
 * - OPEN_BOOKINGS
 * - NOT_READY:<reason>
 * - CONTACT_BLOCKED:<reason>
 * - READY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  compareYmd,
  isInvoiceMonthReadyToFinalize,
  lastDayYmdOfInvoiceMonth,
  todayJohannesburg,
} from "../lib/recurring/johannesburgCalendar";
import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";

const PROD_REF = "paqjwfulwywtsyyvdxrq";

function fail(message: string): never {
  console.error(`AUDIT_FAIL: ${message}`);
  process.exit(1);
}

type PlanRow = {
  id: string;
  frequency: string | null;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  skip_next_occurrence_date: string | null;
  monthly_pattern: string | null;
  monthly_nth: number | null;
};

function planOverlapsInvoiceMonth(plan: PlanRow, invoiceMonthYm: string): boolean {
  const monthStart = `${invoiceMonthYm}-01`;
  const monthEnd = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  if (compareYmd(plan.start_date, monthEnd) > 0) return false;
  if (plan.end_date && compareYmd(plan.end_date, monthStart) < 0) return false;
  return true;
}

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function expectedOccurrenceDatesForPlanInMonthLocal(plan: PlanRow, invoiceMonthYm: string): string[] {
  const monthStart = ymdToUtcDate(`${invoiceMonthYm}-01`);
  const monthEnd = ymdToUtcDate(lastDayYmdOfInvoiceMonth(invoiceMonthYm));
  const start = ymdToUtcDate(plan.start_date);
  const end = plan.end_date ? ymdToUtcDate(plan.end_date) : monthEnd;

  const effectiveStart = start > monthStart ? start : monthStart;
  const effectiveEnd = end < monthEnd ? end : monthEnd;
  if (effectiveStart > effectiveEnd) return [];

  const frequency = String(plan.frequency ?? "").toLowerCase();
  const out: string[] = [];

  if (frequency === "weekly" || frequency === "biweekly") {
    const wanted = new Set((plan.days_of_week ?? []).map(Number));
    const stepWeeks = frequency === "biweekly" ? 2 : 1;

    for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!wanted.has(d.getUTCDay())) continue;
      if (stepWeeks === 2) {
        const daysFromStart = Math.floor((d.getTime() - start.getTime()) / 86400000);
        const weeksFromStart = Math.floor(daysFromStart / 7);
        if (weeksFromStart % 2 !== 0) continue;
      }
      out.push(utcDateToYmd(d));
    }
    return out;
  }

  if (frequency === "monthly") {
    const nth = Number(plan.monthly_nth ?? 1);
    const wanted = (plan.days_of_week ?? [start.getUTCDay()]).map(Number);
    const weekday = wanted[0] ?? start.getUTCDay();
    let seen = 0;

    for (let d = new Date(monthStart); d <= monthEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() !== weekday) continue;
      seen += 1;
      if (seen === nth && d >= effectiveStart && d <= effectiveEnd) {
        out.push(utcDateToYmd(d));
        break;
      }
    }
    return out;
  }

  // Conservative fallback for unsupported/legacy frequencies:
  // use actual invoice bookings rather than inventing expected dates.
  return [];
}

async function assessReadinessLocally(
  admin: SupabaseClient,
  params: { invoiceId: string; customerId: string; month: string; todayYmd: string },
): Promise<{ ready: boolean; reason?: string }> {
  const { data: invoiceBookings, error: invErr } = await admin
    .from("bookings")
    .select("date, recurring_id, monthly_invoice_id, status")
    .eq("monthly_invoice_id", params.invoiceId)
    .neq("status", "cancelled");

  if (invErr) return { ready: false, reason: invErr.message };

  const bookings = (invoiceBookings ?? []) as Array<{
    date: string;
    recurring_id: string | null;
    monthly_invoice_id: string | null;
    status: string | null;
  }>;

  const inMonth = bookings.map((b) => b.date).filter((d) => d.startsWith(params.month));
  if (inMonth.length === 0) return { ready: false, reason: "no_bookings" };

  const lastVisit = inMonth.reduce((max, d) => (compareYmd(d, max) > 0 ? d : max));

  const { data: planRows, error: planErr } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, price, frequency, days_of_week, start_date, end_date, booking_snapshot_template, preferred_cleaner_id, skip_next_occurrence_date, monthly_pattern, monthly_nth, status",
    )
    .eq("customer_id", params.customerId)
    .eq("status", "active");

  if (planErr) return { ready: false, reason: planErr.message };

  const plans = (planRows ?? [])
    .map((raw) => raw as unknown as PlanRow)
    .filter((plan) => planOverlapsInvoiceMonth(plan, params.month));

  if (plans.length === 0) {
    if (!isInvoiceMonthReadyToFinalize(params.todayYmd, params.month)) {
      return { ready: false, reason: "invoice_month_not_ended" };
    }
    return { ready: true };
  }

  if (compareYmd(params.todayYmd, lastVisit) < 0) {
    return { ready: false, reason: "upcoming_visits_in_month" };
  }

  for (const plan of plans) {
    const expected = expectedOccurrenceDatesForPlanInMonthLocal(plan, params.month);
    if (expected.length === 0) continue;

    const { data: planBookings } = await admin
      .from("bookings")
      .select("date, monthly_invoice_id, status")
      .eq("recurring_id", plan.id);

    const onInvoiceDates = new Set(
      (planBookings ?? [])
        .filter((b) => String((b as { monthly_invoice_id?: string }).monthly_invoice_id ?? "") === params.invoiceId)
        .map((b) => String((b as { date: string }).date)),
    );

    for (const date of expected) {
      if (plan.skip_next_occurrence_date && date === plan.skip_next_occurrence_date) continue;
      if (!onInvoiceDates.has(date)) {
        return { ready: false, reason: "recurring_schedule_incomplete" };
      }
    }
  }

  return { ready: true };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const today = todayJohannesburg();

  const { data: drafts, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, zoho_invoice_id, is_closed")
    .eq("status", "draft")
    .order("month", { ascending: true })
    .order("id", { ascending: true });

  if (error) fail(`draft query failed: ${error.message}`);

  let ready = 0;
  let zeroCancelledOnly = 0;
  let openBookings = 0;
  let contactBlocked = 0;
  let notReady = 0;

  console.log("OFFICE_BILLING_E2E_05_DRAFT_READINESS");
  console.log(`TODAY_JHB=${today}`);
  console.log(`DRAFTS=${drafts?.length ?? 0}`);

  for (const raw of drafts ?? []) {
    const row = raw as {
      id: string;
      customer_id: string;
      month: string;
      total_amount_cents: number | null;
      amount_paid_cents: number | null;
      zoho_invoice_id: string | null;
      is_closed: boolean | null;
    };

    if (String(row.zoho_invoice_id ?? "").trim()) {
      fail(`draft ${row.id} unexpectedly already linked to Zoho`);
    }

    const { data: bookings, error: bookingError } = await admin
      .from("bookings")
      .select("id, date, status")
      .eq("monthly_invoice_id", row.id)
      .order("date", { ascending: true });

    if (bookingError) fail(`booking query failed for ${row.id}: ${bookingError.message}`);

    const bookingRows = bookings ?? [];
    const cancelled = bookingRows.filter(
      (b) => String((b as { status?: string }).status ?? "").toLowerCase() === "cancelled",
    ).length;
    const completed = bookingRows.filter(
      (b) => String((b as { status?: string }).status ?? "").toLowerCase() === "completed",
    ).length;
    const open = bookingRows.length - cancelled - completed;
    const totalCents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));

    let classification = "";
    let reason: string | null = null;
    let resolvedContact = false;

    if (totalCents === 0 && bookingRows.length > 0 && cancelled === bookingRows.length) {
      classification = "ZERO_CANCELLED_ONLY";
      zeroCancelledOnly += 1;
    } else if (open > 0) {
      classification = "OPEN_BOOKINGS";
      reason = `open_bookings=${open}`;
      openBookings += 1;
    } else if (totalCents <= 0) {
      classification = "NOT_READY";
      reason = "non_positive_total";
      notReady += 1;
    } else {
      const readiness = await assessReadinessLocally(admin, {
        invoiceId: row.id,
        customerId: row.customer_id,
        month: row.month,
        todayYmd: today,
      });

      if (!readiness.ready) {
        classification = "NOT_READY";
        reason = readiness.reason ?? "unknown";
        notReady += 1;
      } else {
        const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
          invoiceId: row.id,
          customerId: row.customer_id,
        });
        if (!contact.ok) {
          classification = "CONTACT_BLOCKED";
          reason = contact.error;
          contactBlocked += 1;
        } else {
          classification = "READY";
          resolvedContact = true;
          ready += 1;
        }
      }
    }

    console.log(JSON.stringify({
      id: row.id,
      month: row.month,
      total_cents: totalCents,
      booking_count: bookingRows.length,
      completed_count: completed,
      cancelled_count: cancelled,
      open_count: open,
      classification,
      reason,
      contact_resolved: resolvedContact,
    }));
  }

  console.log(
    `SUMMARY ready=${ready} zero_cancelled_only=${zeroCancelledOnly} open_bookings=${openBookings} contact_blocked=${contactBlocked} not_ready=${notReady}`,
  );
  console.log("READ_ONLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
