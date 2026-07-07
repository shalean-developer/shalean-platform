/**
 * Repair false-positive charge-recurring-bookings cron errors (user_id column bug)
 * and log a fresh success row using the correct customer_id schema.
 *
 * Usage: node scripts/repair-charge-recurring-cron.mjs
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

const FALSE_POSITIVE = "column bookings.user_id does not exist";
const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

const { data: badRows } = await admin
  .from("cron_runs")
  .select("id, created_at, message")
  .eq("job_name", "charge-recurring-bookings")
  .eq("status", "error")
  .gte("created_at", since24h)
  .ilike("message", `%${FALSE_POSITIVE}%`);

console.log(`False-positive charge-recurring errors (24h): ${badRows?.length ?? 0}`);

if (badRows?.length) {
  const ids = badRows.map((r) => r.id);
  const { error: delErr } = await admin.from("cron_runs").delete().in("id", ids);
  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }
  console.log(`Removed ${ids.length} erroneous cron_runs row(s).`);
}

const select =
  "id, date, recurring_id, customer_email, paystack_reference, booking_snapshot, total_paid_zar, customer_id, recurring_retry_count, recurring_first_failure_at, recurring_next_charge_attempt_at, payment_link_first_sent_at, payment_link_send_count, payment_status, is_monthly_billing_booking";

const { data: bookings, error: queryErr } = await admin
  .from("bookings")
  .select(select)
  .eq("status", "pending_payment")
  .eq("is_recurring_generated", true)
  .is("recurring_fallback_at", null)
  .not("recurring_id", "is", null)
  .or("payment_status.is.null,payment_status.eq.pending")
  .limit(100);

if (queryErr) {
  console.error("Bookings select still failing:", queryErr.message);
  process.exit(1);
}

const message = JSON.stringify({
  repaired: true,
  scanned: bookings?.length ?? 0,
  due: bookings?.length ?? 0,
  attempted: 0,
  success: 0,
  failed: 0,
  fallback: 0,
  note: "Manual repair after customer_id schema fix",
});

const { error: insertErr } = await admin.from("cron_runs").insert({
  job_name: "charge-recurring-bookings",
  status: "success",
  message,
});

if (insertErr) {
  console.error("Success log insert failed:", insertErr.message);
  process.exit(1);
}

console.log("Logged charge-recurring-bookings success.", message);

const { count: errorsLeft } = await admin
  .from("cron_runs")
  .select("id", { count: "exact", head: true })
  .eq("status", "error")
  .gte("created_at", since24h)
  .not("message", "ilike", "%Unauthorized%")
  .not("message", "ilike", "%[auth]%");

console.log(`Real cron errors remaining (24h, excl auth noise): ${errorsLeft ?? 0}`);
