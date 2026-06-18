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
const JUNE_START = "2026-06-01";
const JUNE_END = "2026-06-30";
const CURSOR_END = "2026-07-28";

async function main() {
  console.log("=== June 2026 recurring diagnostics ===\n");

  const { data: cronRuns, error: cronErr } = await admin
    .from("cron_runs")
    .select("job_name, status, created_at, message")
    .eq("job_name", "generate-recurring-bookings")
    .gte("created_at", "2026-06-01T00:00:00Z")
    .lte("created_at", "2026-06-30T23:59:59Z")
    .order("created_at", { ascending: false })
    .limit(20);

  if (cronErr) console.log("cron_runs error:", cronErr.message);
  else {
    console.log(`Cron runs in June (latest 20): ${cronRuns?.length ?? 0}`);
    for (const r of cronRuns ?? []) {
      console.log(`  ${r.created_at} ${r.status} ${String(r.message ?? "").slice(0, 120)}`);
    }
    if ((cronRuns?.length ?? 0) === 0) console.log("  ⚠ No generate-recurring-bookings runs logged in June!");
  }

  const { count: juneBookings, error: bkErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .gte("date", JUNE_START)
    .lte("date", JUNE_END);

  if (bkErr) console.log("\nbookings count error:", bkErr.message);
  else console.log(`\nRecurring-generated bookings in June 2026: ${juneBookings ?? 0}`);

  const { data: mayBookings } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31");
  console.log(`Recurring-generated bookings in May 2026: ${mayBookings ?? "?"}`);

  const { data: plans, error: planErr } = await admin
    .from("recurring_bookings")
    .select(
      "id, status, frequency, days_of_week, start_date, end_date, next_run_date, last_generated_at, customer_id",
    )
    .order("updated_at", { ascending: false });

  if (planErr) {
    console.log("\nrecurring_bookings error:", planErr.message);
    return;
  }

  const active = (plans ?? []).filter((p) => p.status === "active");
  const paused = (plans ?? []).filter((p) => p.status === "paused");
  console.log(`\nRecurring plans: ${plans?.length ?? 0} total, ${active.length} active, ${paused.length} paused`);

  const eligible = active.filter((p) => {
    const startOk = p.start_date <= JUNE_END;
    const endOk = !p.end_date || p.end_date >= JUNE_START;
    const cursorOk = p.next_run_date <= CURSOR_END;
    return startOk && endOk && cursorOk;
  });
  const ineligibleCursor = active.filter((p) => p.next_run_date > CURSOR_END);
  const noDays = active.filter((p) => !Array.isArray(p.days_of_week) || p.days_of_week.length === 0);

  console.log(`Active plans eligible for June cron query: ${eligible.length}`);
  console.log(`Active plans EXCLUDED (next_run_date > ${CURSOR_END}): ${ineligibleCursor.length}`);
  console.log(`Active plans with empty days_of_week: ${noDays.length}`);

  if (ineligibleCursor.length > 0) {
    console.log("\nPlans excluded by cursor (next_run_date too far ahead):");
    for (const p of ineligibleCursor.slice(0, 10)) {
      console.log(`  ${p.id.slice(0, 8)}… next=${p.next_run_date} last_gen=${p.last_generated_at ?? "—"}`);
    }
  }

  const customerIds = [...new Set(active.map((p) => p.customer_id))];
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, billing_type, schedule_type")
    .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const missingProfile = active.filter((p) => !profileMap.has(p.customer_id));
  console.log(`\nActive plans with missing user_profiles: ${missingProfile.length}`);
  if (missingProfile.length > 0) {
    for (const p of missingProfile.slice(0, 8)) {
      console.log(`  plan ${p.id.slice(0, 8)}… customer ${p.customer_id.slice(0, 8)}…`);
    }
  }

  const { data: juneLogs } = await admin
    .from("system_logs")
    .select("message, created_at, context")
    .eq("source", "cron/generate-recurring-bookings")
    .gte("created_at", "2026-06-01T00:00:00Z")
    .order("created_at", { ascending: false })
    .limit(30);

  const skipMsgs = (juneLogs ?? []).filter((l) =>
    String(l.message).includes("skip") || String(l.message).includes("failed"),
  );
  console.log(`\nJune generator system_logs (skip/fail): ${skipMsgs.length}`);
  for (const l of skipMsgs.slice(0, 15)) {
    console.log(`  ${l.created_at} ${l.message} ${JSON.stringify(l.context ?? {}).slice(0, 100)}`);
  }

  const { data: recentCron } = await admin
    .from("cron_runs")
    .select("job_name, status, created_at, message")
    .in("job_name", ["generate-recurring-bookings", "charge-recurring-bookings"])
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\nMost recent cron runs (any month):");
  for (const r of recentCron ?? []) {
    console.log(`  ${r.created_at} ${r.job_name} ${r.status} ${String(r.message ?? "").slice(0, 100)}`);
  }

  const { data: lastGen } = await admin
    .from("cron_runs")
    .select("created_at, status, message")
    .eq("job_name", "generate-recurring-bookings")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\nLast generate-recurring-bookings runs (all time):");
  if (!lastGen?.length) console.log("  ⚠ NEVER RAN — pg_cron job likely not scheduled");
  for (const r of lastGen ?? []) {
    console.log(`  ${r.created_at} ${r.status} ${String(r.message ?? "").slice(0, 150)}`);
  }

  const { count: mayCount } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31");
  console.log(`\nMay 2026 recurring-generated bookings: ${mayCount ?? 0}`);

  console.log("\nSample active plan cursors:");
  for (const p of active.slice(0, 6)) {
    console.log(
      `  ${p.id.slice(0, 8)}… freq=${p.frequency} days=${JSON.stringify(p.days_of_week)} next=${p.next_run_date} last_gen=${p.last_generated_at ?? "never"}`,
    );
  }

  console.log(`\nCRON_SECRET configured locally: ${Boolean(process.env.CRON_SECRET?.trim())}`);

  const { data: juneSample } = await admin
    .from("bookings")
    .select("status, cleaner_id, selected_cleaner_id, billing_type, is_monthly_billing_booking")
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .lte("date", "2026-06-30")
    .limit(3);
  console.log("\nJune booking sample:", juneSample);

  const { data: juneAll } = await admin
    .from("bookings")
    .select("status")
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .lte("date", "2026-06-30");
  const statusCounts = {};
  for (const r of juneAll ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  console.log("June status counts:", statusCounts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
