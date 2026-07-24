/**
 * Production office dashboard source-of-truth audit.
 *
 * Run (requires apps/web/.env.local with service role):
 *   node --env-file=.env.local scripts/auditOfficeDashboardAccuracy.mjs
 *   # or:
 *   node scripts/auditOfficeDashboardAccuracy.mjs
 *
 * Optional: AUDIT_DATE=YYYY-MM-DD (defaults to today in Africa/Johannesburg)
 *
 * Prints independent counts for every /office home widget and flags mismatches
 * against the same TypeScript helpers the dashboard uses.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// Load compiled helpers via tsx when available; otherwise inline minimal mirrors.
let computeOfficeTodayScheduleStats;
let computeOfficeVisitDayFinance;
let computeAdminDashboardRevenueSummary;
let computeOpsSnapshotFromRows;
let johannesburgDayUtcBounds;

async function loadHelpers() {
  try {
    const { register } = await import("tsx/esm/api");
    register();
  } catch {
    // vitest/tsx may already be on path via node --import
  }
  try {
    ({ computeOfficeTodayScheduleStats } = await import("../lib/admin/officeTodayScheduleStats.ts"));
    ({ computeOfficeVisitDayFinance } = await import("../lib/admin/dashboardVisitDayFinance.ts"));
    ({ computeAdminDashboardRevenueSummary } = await import("../lib/admin/dashboardRevenue.ts"));
    ({ computeOpsSnapshotFromRows } = await import("../lib/admin/opsSnapshot.ts"));
    ({ johannesburgDayUtcBounds } = await import("../lib/admin/metrics.ts"));
  } catch (e) {
    console.error("Failed to import TS helpers. Run with: npx tsx scripts/auditOfficeDashboardAccuracy.mjs");
    console.error(e);
    process.exit(1);
  }
}

function todayYmd() {
  return (
    process.env.AUDIT_DATE?.trim() ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" })
  );
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function money(zar) {
  return `R${Math.round(Number(zar) || 0).toLocaleString("en-ZA")}`;
}

await loadHelpers();

const date = todayYmd();
const now = new Date();
const { startIso: todayStartIso, endExclusiveIso: todayEndExclusiveIso } = johannesburgDayUtcBounds(date);

section(`OFFICE DASHBOARD AUDIT — visit date ${date} (JHB)`);
console.log("Now ISO:", now.toISOString());
console.log("Payment-day window:", todayStartIso, "→", todayEndExclusiveIso);

const BOOKING_SELECT =
  "id, date, time, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, customer_name, service, payment_status, payment_completed_at, payment_method, total_paid_zar, amount_paid_cents, total_price, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, dispatch_status, became_pending_at, created_at, total_paid_cents, is_recurring_generated, recurring_id, paystack_reference, zoho_invoice_id, payment_reference_external";

const { data: dayBookings, error: dayErr } = await admin
  .from("bookings")
  .select(BOOKING_SELECT)
  .eq("date", date)
  .order("time", { ascending: true })
  .limit(800);
if (dayErr) {
  console.error("Day bookings query failed:", dayErr.message);
  process.exit(1);
}

const summary = computeOfficeTodayScheduleStats(dayBookings ?? []);
const finance = computeOfficeVisitDayFinance(dayBookings ?? []);

section("1. BOOKING VALIDATION (visit date)");
console.log("SQL: select ... from bookings where date =", date);
console.log("Record count:", dayBookings?.length ?? 0);
console.log("Dashboard-equivalent summary:", summary);
console.log("Status histogram:");
const statusHist = {};
for (const b of dayBookings ?? []) {
  const st = String(b.status ?? "null").toLowerCase();
  statusHist[st] = (statusHist[st] ?? 0) + 1;
}
console.log(statusHist);

section("2. VISIT-DAY FINANCE (reconciles completed vs paid)");
console.log(finance);
console.log(
  "Interpretation: completed paid value",
  money(finance.completedPaidValueZar),
  "| unpaid completed",
  finance.unpaidCompletedCount,
  "| monthly children",
  finance.monthlyChildCount,
);

const completedRows = (dayBookings ?? []).filter((b) => String(b.status ?? "").toLowerCase() === "completed");
section("5. BOOKING → PAYMENT RECONCILIATION (completed today)");
console.log("Completed count:", completedRows.length);
for (const b of completedRows.slice(0, 50)) {
  const cents = Number(b.amount_paid_cents);
  const zar = Number.isFinite(cents) && cents > 0 ? cents / 100 : Number(b.total_paid_zar) || 0;
  console.log(
    [
      b.id,
      (b.customer_name ?? "").slice(0, 24).padEnd(24),
      `status=${b.status}`,
      `pay=${b.payment_status}`,
      `method=${b.payment_method ?? "-"}`,
      `paid=${money(zar)}`,
      `paid_at=${b.payment_completed_at ?? "-"}`,
      `monthly=${b.monthly_invoice_id ? "yes" : "no"}`,
      `ref=${b.paystack_reference || b.payment_reference_external || "-"}`,
    ].join(" | "),
  );
}

section("3. PAYMENT VALIDATION (payment_completed_at = today)");
const windowStartIso = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
const { data: paidWindow, error: paidErr } = await admin
  .from("bookings")
  .select(
    "id,status,payment_status,payment_completed_at,total_paid_zar,amount_paid_cents,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id,payment_method",
  )
  .eq("payment_status", "success")
  .not("payment_completed_at", "is", null)
  .gte("payment_completed_at", windowStartIso)
  .order("payment_completed_at", { ascending: false })
  .limit(15000);
if (paidErr) console.error("Paid window query failed:", paidErr.message);
const revenueSummary = computeAdminDashboardRevenueSummary(paidWindow ?? [], now);
console.log("Dashboard revenueTodayZar:", money(revenueSummary.revenueTodayZar));
console.log("Dashboard paidBookingsToday:", revenueSummary.paidBookingsToday);
console.log("Scope:", revenueSummary.scope);

const { data: paymentTxToday } = await admin
  .from("payment_transactions")
  .select("id, status, amount_cents, net_settlement_cents, paid_at, provider, booking_id")
  .gte("paid_at", todayStartIso)
  .lt("paid_at", todayEndExclusiveIso)
  .limit(2000);
const txByStatus = {};
let txSuccessCents = 0;
for (const tx of paymentTxToday ?? []) {
  const st = String(tx.status ?? "unknown").toLowerCase();
  txByStatus[st] = (txByStatus[st] ?? 0) + 1;
  if (st === "success" || st === "successful" || st === "paid") {
    txSuccessCents += Number(tx.amount_cents ?? tx.net_settlement_cents ?? 0) || 0;
  }
}
console.log("payment_transactions today:", { count: paymentTxToday?.length ?? 0, byStatus: txByStatus, successZar: Math.round(txSuccessCents / 100) });
console.log(
  "NOTE: Home dashboard revenue uses booking payment fields, NOT payment_transactions. Drift between these is a High finding if both are non-zero and disagree.",
);

section("4. INVOICE VALIDATION");
const { data: overdueInv } = await admin
  .from("monthly_invoices")
  .select("id, balance_cents, status, is_overdue, due_date, month, amount_paid_cents, total_amount_cents")
  .or("status.eq.overdue,is_overdue.eq.true")
  .limit(1000);
const overdueZar = (overdueInv ?? []).reduce((s, r) => s + (Number(r.balance_cents) > 0 ? Number(r.balance_cents) : 0), 0) / 100;
console.log("Overdue invoices:", overdueInv?.length ?? 0, "balance", money(overdueZar));

const { data: monthInvoices } = await admin
  .from("monthly_invoices")
  .select("id, status, total_amount_cents, amount_paid_cents, balance_cents, month, created_at")
  .gte("created_at", todayStartIso)
  .lt("created_at", todayEndExclusiveIso)
  .limit(500);
console.log("Invoices created today:", monthInvoices?.length ?? 0);

const { data: pendingPay } = await admin
  .from("bookings")
  .select("id, total_price, total_paid_zar, amount_paid_cents")
  .in("status", ["pending_payment"])
  .in("payment_status", ["pending", "pending_payment"])
  .limit(1000);
let pendingCents = 0;
for (const row of pendingPay ?? []) {
  const c = Number(row.amount_paid_cents);
  if (Number.isFinite(c) && c > 0) pendingCents += c;
  else {
    const z = Number(row.total_paid_zar);
    if (Number.isFinite(z) && z > 0) pendingCents += Math.round(z * 100);
    else {
      const p = Number(row.total_price);
      if (Number.isFinite(p) && p > 0) pendingCents += Math.round(p * 100);
    }
  }
}
console.log("Pending payment bookings:", pendingPay?.length ?? 0, money(pendingCents / 100));
console.log(
  "Receivables exposure (dashboard cash position):",
  money(revenueSummary.revenueTodayZar + pendingCents / 100 + overdueZar),
);

section("6. SCHEDULE SAMPLE");
for (const b of (dayBookings ?? []).slice(0, 15)) {
  console.log(
    `${b.time?.slice(0, 5) ?? "--:--"} | ${String(b.status).padEnd(14)} | cleaner=${b.cleaner_id ?? "-"} pref=${b.selected_cleaner_id ?? "-"} | ${(b.customer_name ?? "").slice(0, 20)}`,
  );
}

section("7. CLEANER CAPACITY");
const { data: cleaners } = await admin
  .from("cleaners")
  .select("id, full_name, is_available, status, is_active, availability_weekdays")
  .or("is_active.is.null,is_active.eq.true")
  .order("full_name");
const { count: allCleaners } = await admin.from("cleaners").select("id", { count: "exact", head: true });
const { count: inactiveCleaners } = await admin
  .from("cleaners")
  .select("id", { count: "exact", head: true })
  .eq("is_active", false);
console.log("Active workforce (dashboard):", cleaners?.length ?? 0);
console.log("All cleaners rows:", allCleaners, "| is_active=false:", inactiveCleaners);

section("8. NEEDS ACTION");
const OPS_SELECT =
  "id,status,date,time,cleaner_id,team_id,dispatch_status,became_pending_at,created_at,total_paid_zar,amount_paid_cents,is_recurring_generated,is_monthly_billing_booking,billing_type,monthly_invoice_id,recurring_id,payment_status";
const openBookings = [];
let opsFrom = 0;
const OPS_PAGE = 1000;
let opsTruncated = false;
for (;;) {
  const { data, error } = await admin
    .from("bookings")
    .select(OPS_SELECT)
    .not("status", "in", "(completed,cancelled,failed,payment_expired)")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(opsFrom, opsFrom + OPS_PAGE - 1);
  if (error) {
    console.error("Ops open bookings failed:", error.message);
    break;
  }
  const chunk = data ?? [];
  openBookings.push(...chunk);
  if (chunk.length < OPS_PAGE) break;
  opsFrom += OPS_PAGE;
  if (opsFrom >= 50_000) {
    opsTruncated = true;
    break;
  }
}
const ops = computeOpsSnapshotFromRows(openBookings, now.getTime());
console.log("Open bookings scanned:", openBookings.length, opsTruncated ? "(TRUNCATED)" : "(complete)");
console.log(ops);

section("10. CROSS-MODULE CHECK");
console.log({
  visitDayBookings: summary.total,
  visitDayCompleted: summary.completed,
  visitDayCompletedPaidZar: finance.completedPaidValueZar,
  visitDayUnpaidCompleted: finance.unpaidCompletedCount,
  paymentsReceivedTodayZar: revenueSummary.revenueTodayZar,
  paidBookingsToday: revenueSummary.paidBookingsToday,
  paymentTxSuccessZarToday: Math.round(txSuccessCents / 100),
  pendingPaymentZar: Math.round(pendingCents / 100),
  overdueInvoiceZar: Math.round(overdueZar),
  receivablesExposureZar: Math.round(revenueSummary.revenueTodayZar + pendingCents / 100 + overdueZar),
});

const findings = [];
if (summary.completed > 0 && finance.completedPaidValueZar === 0 && finance.monthlyChildCount === 0 && finance.unpaidCompletedCount === summary.completed) {
  findings.push({
    severity: "Critical",
    code: "COMPLETED_ALL_UNPAID",
    message: `${summary.completed} completed visits today with no eligible payment evidence`,
  });
}
if (summary.completed > 0 && revenueSummary.revenueTodayZar === 0 && finance.completedPaidValueZar > 0) {
  findings.push({
    severity: "Medium",
    code: "VISIT_VS_PAYMENT_DAY",
    message: `Expected: visit paid ${money(finance.completedPaidValueZar)} with payments-received-today ${money(0)} when jobs were prepaid on earlier days — not a calculation bug if UI labels are clear`,
  });
}
if ((paymentTxToday?.length ?? 0) > 0 && Math.abs(Math.round(txSuccessCents / 100) - revenueSummary.revenueTodayZar) > 1) {
  findings.push({
    severity: "High",
    code: "LEDGER_VS_BOOKING_REVENUE",
    message: `payment_transactions success ${money(txSuccessCents / 100)} != booking revenueToday ${money(revenueSummary.revenueTodayZar)}`,
  });
}
if (opsTruncated) {
  findings.push({
    severity: "High",
    code: "OPS_SNAPSHOT_TRUNCATED",
    message: `ops open-booking scan hit safety ceiling (${openBookings.length} rows) — Needs Action may undercount`,
  });
}

section("FINDINGS");
if (findings.length === 0) console.log("No automated mismatch heuristics fired.");
for (const f of findings) console.log(`[${f.severity}] ${f.code}: ${f.message}`);

section("DONE");
console.log("Re-run after deploy to confirm widget values match this script output.");
