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

function isAccrual(b) {
  const bt = String(b.billing_type ?? "").toLowerCase();
  if (["recurring_invoice", "monthly_contract", "pay_later"].includes(bt)) return true;
  if (b.is_monthly_billing_booking) return true;
  if (String(b.payment_status ?? "").toLowerCase() === "pending_monthly") return true;
  if (b.monthly_invoice_id) return true;
  return false;
}

function batchDay(b) {
  if (isAccrual(b) && b.date) return b.date;
  if (b.completed_at) return b.completed_at.slice(0, 10);
  return b.date ?? null;
}

const { data: junePayouts } = await admin
  .from("cleaner_payouts")
  .select("id, cleaner_id, period_start, period_end, total_amount_cents, status")
  .gte("period_end", "2026-06-01");

let mismatches = 0;
for (const p of junePayouts ?? []) {
  const { data: bk } = await admin
    .from("bookings")
    .select("id, date, completed_at, customer_name, billing_type, payment_status, monthly_invoice_id, is_monthly_billing_booking")
    .eq("payout_id", p.id);
  for (const b of bk ?? []) {
    const day = batchDay(b);
    const comp = b.completed_at?.slice(0, 10);
    if (day && (day < p.period_start || day > p.period_end)) {
      mismatches++;
      console.log(
        `MISMATCH payout ${p.id.slice(0, 8)} period ${p.period_start}–${p.period_end} visit=${b.date} batchDay=${day} completed=${comp} ${b.customer_name}`,
      );
    }
  }
}
console.log(`\nTotal mismatched linked bookings (visit week vs batch period): ${mismatches}`);
