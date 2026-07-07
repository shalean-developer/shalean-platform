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

const { data: dispatchRows } = await admin
  .from("bookings")
  .select("id, status, dispatch_status, payment_status, payment_completed_at, updated_at, created_at, cleaner_id, team_id, selected_cleaner_id")
  .not("status", "in", "(completed,cancelled,failed,payment_expired)")
  .limit(500);

const now = Date.now();
const staleMin = 60;
let staleCount = 0;
for (const row of dispatchRows ?? []) {
  const hasAssignment = !!(row.cleaner_id || row.team_id || row.selected_cleaner_id);
  if (hasAssignment) continue;
  const ps = String(row.payment_status ?? "").toLowerCase();
  const paid = ps === "paid" || ps === "monthly" || ps === "pending_monthly";
  if (!paid) continue;
  const ds = String(row.dispatch_status ?? "").toLowerCase();
  if (!["searching", "failed", "", "offered"].includes(ds)) continue;
  if (ds === "unassignable" || ds === "no_cleaner") continue;
  const anchor = row.payment_completed_at || row.updated_at || row.created_at;
  const ageMin = anchor ? (now - Date.parse(anchor)) / 60000 : null;
  if (ageMin != null && ageMin >= staleMin) staleCount++;
}

console.log("dispatch_stale_unassigned candidates:", staleCount);

const since1h = new Date(Date.now() - 3600_000).toISOString();
const { data: bookingCronErrors } = await admin
  .from("cron_runs")
  .select("job_name, message, created_at")
  .eq("status", "error")
  .gte("created_at", since1h)
  .in("job_name", [
    "generate-recurring-bookings",
    "charge-recurring-bookings",
    "charge-monthly-invoices",
    "booking-lifecycle",
    "retry-failed-jobs",
  ]);

const realErrors = (bookingCronErrors ?? []).filter((r) => {
  const m = (r.message ?? "").trim();
  return !(m.startsWith("[auth]") || m === "Unauthorized." || /skipped.*lock/i.test(m));
});
console.log("Booking engine cron errors (1h):", realErrors.length);

const { data: websiteErrors } = await admin
  .from("system_logs")
  .select("id", { count: "exact", head: true })
  .eq("level", "error")
  .gte("created_at", since1h);
console.log("System errors (1h):", websiteErrors?.length ?? "query failed");
