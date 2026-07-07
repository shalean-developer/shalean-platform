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
const since1h = new Date(Date.now() - 3600_000).toISOString();

function isNoise(msg) {
  const m = (msg ?? "").trim();
  return m === "Unauthorized." || m.startsWith("[auth]") || m.startsWith("[env]") || /skipped.*lock/i.test(m);
}

const { data: cronErrors24h } = await admin
  .from("cron_runs")
  .select("job_name, message, created_at")
  .eq("status", "error")
  .gte("created_at", since24h);

const real24h = (cronErrors24h ?? []).filter((r) => !isNoise(r.message));
const real1h = real24h.filter((r) => r.created_at >= since1h);

console.log("Cron errors 24h:", real24h.length);
console.log("Cron errors 1h:", real1h.length);

const { data: lastCharge } = await admin
  .from("cron_runs")
  .select("status, message, created_at")
  .eq("job_name", "charge-recurring-bookings")
  .order("created_at", { ascending: false })
  .limit(3);
console.log("\nLast charge-recurring runs:");
for (const r of lastCharge ?? []) console.log(" ", r.created_at, r.status, (r.message ?? "").slice(0, 80));

const { count: unassigned } = await admin
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .not("status", "in", "(completed,cancelled,failed,pending_payment)")
  .is("cleaner_id", null)
  .is("team_id", null)
  .eq("is_recurring_generated", true);

console.log("\nRecurring without cleaner_id (non-terminal):", unassigned);

const { data: overdueInv } = await admin
  .from("monthly_invoices")
  .select("balance_cents")
  .or("status.eq.overdue,is_overdue.eq.true");
const overdueZar = (overdueInv ?? []).reduce((s, i) => s + (i.balance_cents ?? 0) / 100, 0);
console.log("Overdue invoices ZAR:", overdueZar.toFixed(2));
