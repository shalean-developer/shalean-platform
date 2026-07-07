import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

function isCronNoise(msg) {
  const m = (msg ?? "").trim();
  return (
    m === "Unauthorized." ||
    m === "[auth] Unauthorized." ||
    m.startsWith("[auth]") ||
    m.startsWith("[env]") ||
    /skipped.*lock/i.test(m)
  );
}

const { data: cronRows } = await admin
  .from("cron_runs")
  .select("job_name,status,message,created_at")
  .gte("created_at", since24h)
  .eq("status", "error")
  .order("created_at", { ascending: false })
  .limit(200);

console.log("=== CRON ERRORS (24h) ===");
console.log("Total error rows:", cronRows?.length ?? 0);
const realErrors = (cronRows ?? []).filter((r) => !isCronNoise(r.message));
console.log("Real errors (after noise filter):", realErrors.length);
const byJob = {};
for (const r of realErrors) {
  byJob[r.job_name] = (byJob[r.job_name] ?? 0) + 1;
}
console.log("By job:", byJob);
for (const r of realErrors.slice(0, 20)) {
  console.log(" ", r.created_at?.slice(0, 19), r.job_name, "|", (r.message ?? "").slice(0, 150));
}

const SELECT =
  "id,status,date,time,cleaner_id,team_id,dispatch_status,became_pending_at,created_at,total_paid_zar,amount_paid_cents,is_recurring_generated,is_monthly_billing_booking,billing_type,monthly_invoice_id,recurring_id,payment_status";
const { data: bookings } = await admin
  .from("bookings")
  .select(SELECT)
  .not("status", "in", "(completed,cancelled,failed)")
  .limit(3500);

function zar(r) {
  return typeof r.total_paid_zar === "number" ? r.total_paid_zar : Math.round((r.amount_paid_cents ?? 0) / 100);
}
function isPaid(r) {
  return zar(r) > 0;
}
function isRecurringOrMonthly(r) {
  if (r.is_recurring_generated) return true;
  if (r.is_monthly_billing_booking) return true;
  if (String(r.billing_type ?? "").toLowerCase() === "monthly") return true;
  if (String(r.monthly_invoice_id ?? "").trim()) return true;
  if (String(r.recurring_id ?? "").trim()) return true;
  const ps = String(r.payment_status ?? "").toLowerCase();
  return ps === "pending_monthly" || ps === "monthly";
}
function hasAssignment(r) {
  return !!(String(r.cleaner_id ?? "").trim() || String(r.team_id ?? "").trim());
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
let unassigned = 0;
let unassignedToday = 0;
let unassignedPast = 0;
let unassignedFuture = 0;
const byStatus = {};
const byReason = { paid: 0, recurring: 0, both: 0 };
const dateBreakdown = {};

for (const r of bookings ?? []) {
  const st = String(r.status ?? "").toLowerCase();
  if (st === "pending_payment") continue;
  const noCleaner = !hasAssignment(r);
  const paid = isPaid(r);
  const recurring = isRecurringOrMonthly(r);
  if (noCleaner && (paid || recurring)) {
    unassigned++;
    if (r.date === today) unassignedToday++;
    else if (r.date && r.date < today) unassignedPast++;
    else unassignedFuture++;
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (paid && recurring) byReason.both++;
    else if (paid) byReason.paid++;
    else byReason.recurring++;
    const month = r.date?.slice(0, 7) ?? "?";
    dateBreakdown[month] = (dateBreakdown[month] ?? 0) + 1;
  }
}

console.log("\n=== UNASSIGNED (ops snapshot logic) ===");
console.log("Open bookings scanned:", bookings?.length ?? 0);
console.log("Total unassigned:", unassigned);
console.log("Today:", unassignedToday, "| Past:", unassignedPast, "| Future:", unassignedFuture);
console.log("By status:", byStatus);
console.log("By reason:", byReason);
console.log("By month:", dateBreakdown);

const { data: pastUnassigned } = await admin
  .from("bookings")
  .select("id,date,status,customer_name,dispatch_status,is_recurring_generated")
  .not("status", "in", "(completed,cancelled,failed,payment_expired)")
  .is("cleaner_id", null)
  .is("team_id", null)
  .lt("date", today)
  .limit(20);
console.log("\nPast-date unassigned sample (first 20):");
for (const b of pastUnassigned ?? []) console.log(" ", b.date, b.status, b.dispatch_status, b.is_recurring_generated, b.customer_name?.slice(0, 30));

const { data: todayBk } = await admin.from("bookings").select("id,status,cleaner_id,selected_cleaner_id,team_id,date").eq("date", today).limit(500);
let todayUnassigned = 0;
for (const b of todayBk ?? []) {
  const st = String(b.status ?? "").toLowerCase();
  if (["completed", "cancelled", "failed", "payment_expired"].includes(st)) continue;
  const has = !!(b.cleaner_id || b.selected_cleaner_id || b.team_id);
  if (!has && !["in_progress", "en_route"].includes(st)) todayUnassigned++;
}
console.log("\n=== TODAY SCHEDULE ===");
console.log("Today YMD:", today, "| Total:", todayBk?.length ?? 0, "| Unassigned:", todayUnassigned);

const { data: overdueInv } = await admin
  .from("monthly_invoices")
  .select("id,balance_cents,status,is_overdue,due_date,month")
  .or("status.eq.overdue,is_overdue.eq.true")
  .limit(50);
console.log("\n=== OVERDUE INVOICES ===");
console.log("Count:", overdueInv?.length);
let overdueZar = 0;
for (const i of overdueInv ?? []) overdueZar += (i.balance_cents ?? 0) / 100;
console.log("Total balance (sample): R", overdueZar.toFixed(2));

for (const col of ["customer_id", "user_id"]) {
  const r = await admin.from("bookings").select(col).limit(1);
  console.log(`Column ${col}:`, r.error?.message ?? "OK");
}

const { data: unassignedDetail } = await admin
  .from("bookings")
  .select("id,date,selected_cleaner_id,cleaner_id,recurring_id,status,dispatch_status,amount_paid_cents,is_recurring_generated")
  .eq("status", "pending_assignment")
  .eq("is_recurring_generated", true)
  .is("cleaner_id", null)
  .gte("date", "2026-07-01")
  .limit(5);
console.log("\nUnassigned recurring sample:", unassignedDetail);

const withSelected = await admin
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .eq("status", "pending_assignment")
  .eq("is_recurring_generated", true)
  .is("cleaner_id", null)
  .not("selected_cleaner_id", "is", null)
  .gte("date", "2026-07-01");
console.log("Unassigned with selected_cleaner_id set:", withSelected.count);

await admin
  .from("recurring_bookings")
  .select("id, preferred_cleaner_id, status")
  .eq("status", "active")
  .is("preferred_cleaner_id", null)
  .limit(5);
const { count: plansNoPreferred } = await admin
  .from("recurring_bookings")
  .select("id", { count: "exact", head: true })
  .eq("status", "active")
  .is("preferred_cleaner_id", null);
console.log("Active plans without preferred_cleaner_id:", plansNoPreferred);

// Ops health: production scan top findings
try {
  const { runProductionHealthScan } = await import("../lib/observability/productionHealthMetrics.ts");
  const scan = await runProductionHealthScan(admin, { scanLimit: 250 });
  console.log("\n=== PRODUCTION HEALTH SCAN ===");
  console.log("Status:", scan.status, "| Total findings:", scan.totalFindings);
  for (const f of scan.findings.slice(0, 8)) {
    console.log(`  [${f.severity}] ${f.code}: ${f.count} — ${f.message.slice(0, 80)}`);
  }
} catch (e) {
  console.log("\nProduction health scan failed:", e.message);
}
