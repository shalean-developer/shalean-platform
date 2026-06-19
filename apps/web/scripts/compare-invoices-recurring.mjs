/**
 * Compare /office/invoices list data vs /office/recurring plans for monthly-billing customers.
 * Run: node apps/web/scripts/compare-invoices-recurring.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseYmdSast(ymd) {
  return new Date(`${ymd}T12:00:00+02:00`);
}

function addDaysYmd(ymd, days) {
  const t = parseYmdSast(ymd).getTime() + days * 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function isoWeekdayFromYmd(ymd) {
  const d = parseYmdSast(ymd);
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Johannesburg", weekday: "short" }).format(d);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[short] ?? (d.getUTCDay() === 0 ? 7 : d.getUTCDay());
}

function lastDayYmdOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekParityIndex(ymd, anchorYmd) {
  function mondayWeekStartMs(y) {
    const iso = isoWeekdayFromYmd(y);
    return parseYmdSast(y).getTime() - (iso - 1) * 86400000;
  }
  const weeks = Math.round((mondayWeekStartMs(ymd) - mondayWeekStartMs(anchorYmd)) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2;
}

function expectedDatesInMonth(plan, monthYm) {
  const monthStart = `${monthYm}-01`;
  const monthEnd = lastDayYmdOfMonth(monthYm);
  const fromYmd = plan.start_date > monthStart ? plan.start_date : monthStart;
  const throughYmd = plan.end_date && plan.end_date < monthEnd ? plan.end_date : monthEnd;
  if (fromYmd > throughYmd) return [];

  const days = [...new Set(plan.days_of_week.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  const out = [];
  let cursor = fromYmd;
  while (cursor <= throughYmd) {
    const iso = isoWeekdayFromYmd(cursor);
    if (days.includes(iso)) {
      let ok = false;
      if (plan.frequency === "weekly") ok = true;
      else if (plan.frequency === "biweekly") {
        ok = weekParityIndex(cursor, plan.start_date) === weekParityIndex(plan.start_date, plan.start_date);
      } else if (plan.frequency === "monthly") ok = true;
      if (cursor >= plan.start_date && ok) out.push(cursor);
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

function formatDays(days) {
  return [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

async function main() {
  const { data: profiles } = await admin.from("user_profiles").select("id, full_name, billing_type");
  const monthlyCustomers = new Set(
    (profiles ?? []).filter((p) => String(p.billing_type ?? "").toLowerCase() === "monthly").map((p) => p.id),
  );

  const { data: plans, error: planErr } = await admin
    .from("recurring_bookings")
    .select("id, customer_id, frequency, days_of_week, start_date, end_date, price, status, booking_snapshot_template")
    .order("updated_at", { ascending: false });

  if (planErr) {
    console.error(planErr.message);
    process.exit(1);
  }

  const { data: invoices, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, total_bookings")
    .order("month", { ascending: false })
    .limit(500);

  if (invErr) {
    console.error(invErr.message);
    process.exit(1);
  }

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const { data: bookingRows } = await admin
    .from("bookings")
    .select("id, monthly_invoice_id, date, status, total_paid_zar, recurring_id")
    .in("monthly_invoice_id", invoiceIds.length ? invoiceIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("status", "cancelled");

  const { data: adjRows } = await admin
    .from("invoice_adjustments")
    .select("customer_id, month_applied, amount_cents, applied_to_invoice_id")
    .in(
      "customer_id",
      [...new Set((invoices ?? []).map((i) => i.customer_id))],
    );

  const bookingsByInvoice = new Map();
  for (const b of bookingRows ?? []) {
    const invId = b.monthly_invoice_id;
    if (!invId) continue;
    if (!bookingsByInvoice.has(invId)) bookingsByInvoice.set(invId, []);
    bookingsByInvoice.get(invId).push(b);
  }

  const adjByCustomerMonth = new Map();
  for (const a of adjRows ?? []) {
    const k = `${a.customer_id}|${a.month_applied}`;
    adjByCustomerMonth.set(k, (adjByCustomerMonth.get(k) ?? 0) + Number(a.amount_cents ?? 0));
  }

  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const plansByCustomer = new Map();
  for (const p of plans ?? []) {
    if (!monthlyCustomers.has(p.customer_id)) continue;
    if (!plansByCustomer.has(p.customer_id)) plansByCustomer.set(p.customer_id, []);
    plansByCustomer.get(p.customer_id).push(p);
  }

  console.log("=== Invoices vs Recurring comparison (monthly-billing customers) ===\n");

  const mismatches = [];
  let compared = 0;
  let aligned = 0;

  for (const inv of invoices ?? []) {
    if (!monthlyCustomers.has(inv.customer_id)) continue;
    const customerPlans = plansByCustomer.get(inv.customer_id) ?? [];
    if (customerPlans.length === 0) continue;

    const plan = customerPlans.find((p) => String(p.status).toLowerCase() !== "cancelled") ?? customerPlans[0];
    const bookings = bookingsByInvoice.get(inv.id) ?? [];
    const listBookingCount = bookings.length;
    const dbBookingCount = Number(inv.total_bookings ?? 0);
    const sumBookingsZar = bookings.reduce((s, b) => s + Math.round(Number(b.total_paid_zar ?? 0)), 0);
    const adjKey = `${inv.customer_id}|${inv.month}`;
    const adjCents = adjByCustomerMonth.get(adjKey) ?? 0;
    const expectedTotalCents = sumBookingsZar * 100 + adjCents;
    const invoiceTotalCents = Number(inv.total_amount_cents ?? 0);

    const expectedDates = expectedDatesInMonth(plan, inv.month);
    const bookingDates = new Set(bookings.map((b) => String(b.date ?? "").slice(0, 10)));
    const onSchedule = bookings.filter((b) => expectedDates.includes(String(b.date ?? "").slice(0, 10)));
    const offSchedule = bookings.filter((b) => !expectedDates.includes(String(b.date ?? "").slice(0, 10)));

    const planPrice = Math.round(Number(plan.price ?? 0));
    const wrongPriceBookings = bookings.filter((b) => Math.round(Number(b.total_paid_zar ?? 0)) !== planPrice);

    const name = (profileName.get(inv.customer_id) ?? "").trim() || inv.customer_id.slice(0, 8);
    compared++;

    const issues = [];
    if (listBookingCount !== dbBookingCount) {
      issues.push(`booking_count: UI/list=${listBookingCount} vs invoice.total_bookings=${dbBookingCount}`);
    }
    if (Math.abs(expectedTotalCents - invoiceTotalCents) > 1) {
      issues.push(
        `total: invoice=${(invoiceTotalCents / 100).toFixed(2)} vs bookings+adj=${(expectedTotalCents / 100).toFixed(2)} (adj R${(adjCents / 100).toFixed(2)})`,
      );
    }
    if (expectedDates.length !== listBookingCount) {
      issues.push(
        `visits: plan expects ${expectedDates.length} (${formatDays(plan.days_of_week)} ${plan.frequency}) vs invoice has ${listBookingCount}`,
      );
    }
    if (offSchedule.length > 0) {
      issues.push(`${offSchedule.length} visit(s) off current schedule (${offSchedule.map((b) => b.date).join(", ")})`);
    }
    if (wrongPriceBookings.length > 0) {
      issues.push(
        `${wrongPriceBookings.length} visit(s) not at plan price R${planPrice} (e.g. R${Math.round(Number(wrongPriceBookings[0].total_paid_zar ?? 0))})`,
      );
    }

    const line = {
      month: inv.month,
      name,
      invoiceId: inv.id.slice(0, 8),
      planId: plan.id.slice(0, 8),
      status: inv.status,
      planSchedule: `${plan.frequency} ${formatDays(plan.days_of_week)} @ R${planPrice}`,
      visits: `${listBookingCount} on invoice / ${expectedDates.length} expected`,
      total: `R${(invoiceTotalCents / 100).toLocaleString("en-ZA")}`,
      issues,
    };

    if (issues.length === 0) aligned++;
    else mismatches.push(line);
  }

  console.log(`Compared ${compared} invoice(s) for customers with recurring plans.`);
  console.log(`Aligned: ${aligned} | Mismatches: ${mismatches.length}\n`);

  if (mismatches.length === 0) {
    console.log("All compared invoices match their recurring plans (visits, price, totals).");
    return;
  }

  for (const m of mismatches.sort((a, b) => b.month.localeCompare(a.month))) {
    console.log(`--- ${m.name} | ${m.month} | ${m.status} | inv ${m.invoiceId} | plan ${m.planId} ---`);
    console.log(`  Plan: ${m.planSchedule}`);
    console.log(`  Visits: ${m.visits}`);
    console.log(`  Total: ${m.total}`);
    for (const i of m.issues) console.log(`  ! ${i}`);
    console.log("");
  }

  // Recurring-only: active plans with no invoice for current month
  const invoiceKeys = new Set((invoices ?? []).map((i) => `${i.customer_id}|${i.month}`));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date());
  const currentYm = today.slice(0, 7);

  console.log("=== Active recurring plans without invoice row for current month ===");
  for (const [customerId, cplans] of plansByCustomer) {
    const active = cplans.find((p) => String(p.status).toLowerCase() === "active");
    if (!active) continue;
    if (!invoiceKeys.has(`${customerId}|${currentYm}`)) {
      const name = (profileName.get(customerId) ?? "").trim() || customerId.slice(0, 8);
      console.log(`  ${name}: plan ${active.id.slice(0, 8)} — no ${currentYm} invoice`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
