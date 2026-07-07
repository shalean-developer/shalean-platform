/**
 * Diagnose why dashboard shows "Ops needs attention".
 * Usage: node scripts/diag-ops-needs-attention.mjs
 */
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

const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
const since1h = new Date(Date.now() - 3600000).toISOString();
const since24h = new Date(Date.now() - 86400000).toISOString();

function isCronNoise(msg) {
  const m = String(msg ?? "").trim();
  if (!m) return false;
  if (m === "Unauthorized." || m.startsWith("[auth]") || m.startsWith("[env]")) return true;
  if (/skipped.*lock/i.test(m)) return true;
  if (/column bookings\.user_id does not exist/i.test(m)) return true;
  return false;
}

const BOOKING_ENGINE_JOBS = new Set([
  "generate-recurring-bookings",
  "charge-recurring-bookings",
  "charge-monthly-invoices",
  "booking-lifecycle",
  "retry-failed-jobs",
]);

const [
  dbProbe,
  systemLogsRes,
  cronRunsRes,
  notificationLogsRes,
  flagsRes,
  failedJobsRes,
] = await Promise.all([
  admin.from("cleaners").select("id").limit(1),
  admin
    .from("system_logs")
    .select("created_at, level, source, message")
    .eq("level", "error")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(500),
  admin
    .from("cron_runs")
    .select("created_at, status, message, job_name")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(5000),
  admin
    .from("notification_logs")
    .select("created_at, status, error")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(5000),
  admin.from("notification_runtime_flags").select("whatsapp_disabled_until, customer_outbound_paused_until").eq("id", 1).maybeSingle(),
  admin
    .from("failed_jobs")
    .select("created_at, type")
    .in("type", ["booking_finalize", "booking_insert", "payment_reconciliation"])
    .gte("created_at", since30d)
    .limit(500),
]);

console.log("=== SERVICE SIGNALS ===\n");
console.log("DB probe:", dbProbe.error ? `FAIL ${dbProbe.error.message}` : "OK");

const websiteDeny = ["cron_run", "cron/", "production_health", "ops_health", "conversion_dashboard", "ops_health_alert"];
const websiteErrors = (systemLogsRes.data ?? []).filter((row) => {
  const text = `${row.source ?? ""} ${row.message ?? ""}`.toLowerCase();
  if (text.includes("supabase") || text.includes("database") || text.includes("postgres")) return false;
  const source = String(row.source ?? "").trim().toLowerCase();
  const message = String(row.message ?? "").trim().toLowerCase();
  if (websiteDeny.some((d) => source.includes(d))) return false;
  if (message.includes("ops_health") || message.includes("production_health_scan")) return false;
  return true;
});
const websiteErrors1h = websiteErrors.filter((r) => r.created_at >= since1h);
console.log("\nWebsite customer-facing errors (1h):", websiteErrors1h.length);
if (websiteErrors1h.length) {
  for (const r of websiteErrors1h.slice(0, 5)) console.log(" ", r.created_at, r.source, (r.message ?? "").slice(0, 100));
}

const cronErrors = (cronRunsRes.data ?? []).filter((r) => String(r.status).toLowerCase() === "error" && !isCronNoise(r.message));
const bookingCronErrors = cronErrors.filter((r) => BOOKING_ENGINE_JOBS.has(String(r.job_name ?? "").trim()));
const bookingCronErrors1h = bookingCronErrors.filter((r) => r.created_at >= since1h);
console.log("\nBooking engine cron errors (1h):", bookingCronErrors1h.length);
for (const r of bookingCronErrors1h.slice(0, 5)) {
  console.log(" ", r.created_at, r.job_name, (r.message ?? "").slice(0, 100));
}

const paymentDrift = failedJobsRes.data ?? [];
const paymentDrift1h = paymentDrift.filter((r) => r.created_at >= since1h);
console.log("\nPayment drift failed_jobs (1h):", paymentDrift1h.length);

const deliveryRows = (notificationLogsRes.data ?? []).filter((r) => {
  const st = String(r.status ?? "").toLowerCase();
  return st === "sent" || st === "failed";
});
const notif1h = deliveryRows.filter((r) => r.created_at >= since1h);
const failed1h = notif1h.filter((r) => String(r.status).toLowerCase() === "failed");
const sent1h = notif1h.filter((r) => String(r.status).toLowerCase() === "sent");
const rate1h = notif1h.length ? (sent1h.length / notif1h.length) * 100 : null;
console.log("\nNotifications (1h): sent", sent1h.length, "failed", failed1h.length, "rate", rate1h?.toFixed(1) ?? "n/a");

const waPaused = flagsRes.data?.whatsapp_disabled_until;
const outboundPaused = flagsRes.data?.customer_outbound_paused_until;
console.log("WhatsApp paused until:", waPaused ?? "null");
console.log("Customer outbound paused until:", outboundPaused ?? "null");

// Derive statuses like officeOpsHealth.ts
const websiteCurrent = websiteErrors1h.length >= 15 ? "down" : websiteErrors1h.length >= 5 ? "degraded" : "operational";
const bookingCurrent = bookingCronErrors1h.length >= 5 ? "degraded" : "operational";
const paymentCurrent = paymentDrift1h.length >= 3 ? "degraded" : "operational"; // simplified

console.log("\n=== DERIVED CURRENT STATUS (simplified) ===");
console.log("website:", websiteCurrent);
console.log("booking_engine:", bookingCurrent);
console.log("payment_gateway:", paymentCurrent, "(check production health findings for full logic)");

console.log("\n=== RECENT CRON ERRORS (all jobs, 24h) ===");
const cron24 = cronErrors.filter((r) => r.created_at >= since24h);
const byJob = {};
for (const r of cron24) byJob[r.job_name] = (byJob[r.job_name] ?? 0) + 1;
console.log("Total real errors 24h:", cron24.length, byJob);
for (const r of cron24.slice(0, 10)) console.log(" ", r.created_at?.slice(0, 19), r.job_name, (r.message ?? "").slice(0, 90));

// Check dispatch rows for production health finding
const { data: dispatchRows } = await admin
  .from("bookings")
  .select("id, status, dispatch_status, payment_status, payment_completed_at, updated_at, created_at, cleaner_id, team_id")
  .not("status", "in", "(completed,cancelled,failed,payment_expired)")
  .limit(500);

let staleDispatch = 0;
const now = Date.now();
for (const row of dispatchRows ?? []) {
  if (row.cleaner_id || row.team_id) continue;
  const ps = String(row.payment_status ?? "").toLowerCase();
  if (!["paid", "monthly", "pending_monthly"].includes(ps)) continue;
  const ds = String(row.dispatch_status ?? "").toLowerCase();
  if (!["searching", "failed", "", "offered"].includes(ds)) continue;
  const anchor = row.payment_completed_at || row.updated_at || row.created_at;
  const ageMin = anchor ? (now - Date.parse(anchor)) / 60000 : null;
  if (ageMin != null && ageMin >= 60) staleDispatch++;
}
console.log("\ndispatch_stale_unassigned candidates:", staleDispatch);
