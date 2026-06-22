/**
 * Audit monthly-billing customers: invoice generation + send readiness.
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/auditMonthlyRecurringInvoices.ts
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/auditMonthlyRecurringInvoices.ts --month=2026-06
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { formatMonthLongYearUtc } from "../lib/admin/invoices/invoiceAdminFormatters";
import { assessMonthlyInvoiceFinalizeReadiness } from "../lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import {
  expectedOccurrenceDatesForPlanInMonth,
  recurringPlanScheduleRowFromDb,
} from "../lib/recurring/reconcileRecurringPlanOccurrences";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const auditMonth = monthArg?.slice("--month=".length).trim() || todayJohannesburg().slice(0, 7);

type CustomerRow = {
  id: string;
  full_name: string | null;
  billing_type: string | null;
};

type InvoiceRow = {
  id: string;
  customer_id: string;
  month: string;
  status: string | null;
  total_amount_cents: number | null;
  total_bookings: number | null;
  due_date: string | null;
  sent_at: string | null;
  payment_link: string | null;
  zoho_invoice_id: string | null;
  is_closed: boolean | null;
};

type PlanRow = {
  id: string;
  customer_id: string;
  start_date: string;
  end_date: string | null;
  status: string | null;
  days_of_week: number[] | null;
  skip_next_occurrence_date: string | null;
};

async function loadMonthlyCustomers(admin: SupabaseClient): Promise<CustomerRow[]> {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_type")
    .eq("billing_type", "monthly")
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerRow[];
}

async function loadInvoicesForMonth(admin: SupabaseClient, month: string): Promise<InvoiceRow[]> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, total_amount_cents, total_bookings, due_date, sent_at, payment_link, zoho_invoice_id, is_closed",
    )
    .eq("month", month);

  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

async function loadActivePlans(admin: SupabaseClient, customerIds: string[]): Promise<PlanRow[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await admin
    .from("recurring_bookings")
    .select(
      "id, customer_id, start_date, end_date, status, days_of_week, frequency, monthly_pattern, monthly_nth, price, booking_snapshot_template, preferred_cleaner_id, skip_next_occurrence_date",
    )
    .in("customer_id", customerIds)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  return (data ?? []) as PlanRow[];
}

async function countBookingsOnInvoice(admin: SupabaseClient, invoiceId: string, month: string): Promise<number> {
  const { count, error } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("monthly_invoice_id", invoiceId)
    .neq("status", "cancelled")
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

function expectedVisitsForCustomer(plans: PlanRow[], customerId: string, month: string): number {
  let total = 0;
  for (const raw of plans.filter((p) => p.customer_id === customerId)) {
    const plan = recurringPlanScheduleRowFromDb(raw as never);
    total += expectedOccurrenceDatesForPlanInMonth(plan, month).filter(
      (d) => !(plan.skip_next_occurrence_date && d === plan.skip_next_occurrence_date),
    ).length;
  }
  return total;
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const today = todayJohannesburg();

  const customers = await loadMonthlyCustomers(admin);
  const invoices = await loadInvoicesForMonth(admin, auditMonth);
  const invoiceByCustomer = new Map(invoices.map((i) => [i.customer_id, i]));
  const plans = await loadActivePlans(
    admin,
    customers.map((c) => c.id),
  );

  console.log(`\nMonthly recurring invoice audit — ${formatMonthLongYearUtc(auditMonth)}`);
  console.log(`Today (Johannesburg): ${today}`);
  console.log(`Monthly-billing customers: ${customers.length}`);
  console.log(`Invoices for month: ${invoices.length}`);
  console.log(`Active recurring plans (these customers): ${plans.length}\n`);

  const rows: Array<{
    customer: string;
    customerId: string;
    expectedVisits: number;
    invoiceStatus: string;
    bookings: number;
    total: string;
    due: string;
    sentAt: string;
    zoho: string;
    readiness: string;
    action: string;
  }> = [];

  for (const c of customers) {
    const name = (c.full_name ?? "").trim() || c.id.slice(0, 8);
    const expected = expectedVisitsForCustomer(plans, c.id, auditMonth);
    const inv = invoiceByCustomer.get(c.id);

    if (!inv) {
      rows.push({
        customer: name,
        customerId: c.id,
        expectedVisits: expected,
        invoiceStatus: "MISSING",
        bookings: 0,
        total: "—",
        due: "—",
        sentAt: "—",
        zoho: "—",
        readiness: "—",
        action: expected > 0 ? "Run generate-recurring-bookings cron or reconcile plan" : "No expected visits",
      });
      continue;
    }

    const bookings = await countBookingsOnInvoice(admin, inv.id, auditMonth);
    const status = String(inv.status ?? "draft").toLowerCase();
    const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
      invoiceId: inv.id,
      customerId: c.id,
      month: auditMonth,
      todayYmd: today,
    });

    let action = "OK";
    if (status === "draft") {
      if (readiness.ready) action = "Ready for cron finalize / admin Send invoice";
      else if (readiness.reason === "upcoming_visits_in_month") {
        action = `Wait until after last visit (${readiness.lastVisitYmd ?? "?"})`;
      } else if (readiness.reason === "recurring_schedule_incomplete") {
        action = "Run generate-recurring-bookings / reconcile recurring plan";
      } else {
        action = `Blocked: ${readiness.reason ?? "not_ready"}`;
      }
    } else if (status === "sent" || status === "partially_paid" || status === "overdue") {
      action = inv.payment_link ? "Sent — payment link active" : "Sent but missing payment link";
    } else if (status === "paid") {
      action = "Paid";
    }

    if (expected > 0 && bookings < expected) {
      action = `${action}; bookings ${bookings}/${expected} expected`;
    }

    rows.push({
      customer: name,
      customerId: c.id,
      expectedVisits: expected,
      invoiceStatus: status.toUpperCase(),
      bookings,
      total: `R ${((inv.total_amount_cents ?? 0) / 100).toLocaleString("en-ZA")}`,
      due: inv.due_date ?? "—",
      sentAt: inv.sent_at ? inv.sent_at.slice(0, 10) : "—",
      zoho: inv.zoho_invoice_id ? "yes" : "no",
      readiness: readiness.ready ? "ready" : (readiness.reason ?? "not_ready"),
      action,
    });
  }

  console.table(
    rows.map((r) => ({
      customer: r.customer,
      status: r.invoiceStatus,
      visits: `${r.bookings}/${r.expectedVisits}`,
      total: r.total,
      due: r.due,
      sent: r.sentAt,
      zoho: r.zoho,
      readiness: r.readiness,
      action: r.action,
    })),
  );

  const missing = rows.filter((r) => r.invoiceStatus === "MISSING");
  const draftNotReady = rows.filter((r) => r.invoiceStatus === "DRAFT" && r.readiness !== "ready");
  const draftReady = rows.filter((r) => r.invoiceStatus === "DRAFT" && r.readiness === "ready");
  const sent = rows.filter((r) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(r.invoiceStatus));
  const paid = rows.filter((r) => r.invoiceStatus === "PAID");

  console.log("\nSummary");
  console.log(`  Missing invoice: ${missing.length}`);
  console.log(`  Draft (not ready to auto-send): ${draftNotReady.length}`);
  console.log(`  Draft (ready for finalize cron): ${draftReady.length}`);
  console.log(`  Sent / partially paid / overdue: ${sent.length}`);
  console.log(`  Paid: ${paid.length}`);

  if (draftReady.length) {
    console.log("\nDraft invoices ready to finalize (cron or admin Send):");
    for (const r of draftReady) console.log(`  - ${r.customer} (${r.customerId})`);
  }

  if (missing.length || draftNotReady.some((r) => r.action.includes("reconcile"))) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
