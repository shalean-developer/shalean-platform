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

const { data: pendingJune } = await admin
  .from("cleaner_payouts")
  .select("id, cleaner_id, period_start, period_end, total_amount_cents, status, cleaners(full_name)")
  .eq("status", "pending")
  .gte("period_end", "2026-06-01");

console.log("=== Pending June-era batches ===\n");
for (const p of pendingJune ?? []) {
  console.log(`${(p.cleaners?.full_name ?? "?").padEnd(22)} ${p.id.slice(0, 8)} ${p.period_start}–${p.period_end} R${(p.total_amount_cents / 100).toFixed(2)}`);
  const { data: bk } = await admin
    .from("bookings")
    .select(
      "id, date, status, customer_name, payment_status, payout_status, monthly_invoice_id, monthly_invoices(month, status), cleaner_payout_cents",
    )
    .eq("payout_id", p.id)
    .order("date");
  for (const b of bk ?? []) {
    console.log(
      `    ${b.date} ${b.customer_name} pay=${b.payment_status} payout=${b.payout_status} inv=${b.monthly_invoices?.month}/${b.monthly_invoices?.status} R${((b.cleaner_payout_cents ?? 0) / 100).toFixed(2)}`,
    );
  }
  console.log("");
}

const { count: allJunePending } = await admin
  .from("cleaner_payouts")
  .select("id", { count: "exact", head: true })
  .gte("period_end", "2026-06-01")
  .eq("status", "pending");

const { count: allJunePaid } = await admin
  .from("cleaner_payouts")
  .select("id", { count: "exact", head: true })
  .gte("period_end", "2026-06-01")
  .eq("status", "paid");

console.log(`June-era pending batches: ${allJunePending}, paid: ${allJunePaid}`);

// Why other June visits not batched?
const { data: juneCompleted } = await admin
  .from("bookings")
  .select("id, date, customer_name, payout_id, payout_status, payment_status, cleaner_id")
  .gte("date", "2026-06-01")
  .lte("date", "2026-06-19")
  .eq("status", "completed")
  .is("payout_id", null)
  .limit(5);

console.log("\nSample June completed visits NOT in any batch:");
for (const b of juneCompleted ?? []) {
  console.log(`  ${b.date} ${b.customer_name} payout=${b.payout_status} pay=${b.payment_status}`);
}

const { count: juneUnbatched } = await admin
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .gte("date", "2026-06-01")
  .lte("date", "2026-06-19")
  .eq("status", "completed")
  .is("payout_id", null);

console.log(`\nJune completed visits with no payout_id: ${juneUnbatched}`);

const payoutIds = (pendingJune ?? []).map((p) => p.id);
if (payoutIds.length) {
  const { data: detail } = await admin
    .from("bookings")
    .select("id, date, completed_at, billing_type, payment_status, monthly_invoice_id, is_monthly_billing_booking, customer_name, recurring_id, payout_id")
    .in("payout_id", payoutIds);
  console.log("\n=== Why repair kept these (completion vs visit date) ===");
  for (const b of detail ?? []) {
    console.log(
      `${b.date} completed=${b.completed_at?.slice(0, 10) ?? "null"} billing=${b.billing_type} recurring=${b.recurring_id?.slice(0, 8) ?? "null"}`,
    );
  }
}
