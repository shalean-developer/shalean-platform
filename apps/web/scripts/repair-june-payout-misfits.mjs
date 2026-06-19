/**
 * Unlink monthly/recurring visits batched into the wrong week (completed_at backfill bug).
 * Run: node apps/web/scripts/repair-june-payout-misfits.mjs
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

function isAccrual(b) {
  const bt = String(b.billing_type ?? "").toLowerCase();
  if (["recurring_invoice", "monthly_contract", "pay_later"].includes(bt)) return true;
  if (b.is_monthly_billing_booking) return true;
  if (String(b.payment_status ?? "").toLowerCase() === "pending_monthly") return true;
  if (b.monthly_invoice_id) return true;
  return false;
}

function weekStart(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

function batchDay(b) {
  if (isAccrual(b) && b.date) return b.date;
  if (b.date && b.completed_at) {
    const visit = b.date;
    const completed = b.completed_at.slice(0, 10);
    if (weekStart(visit) !== weekStart(completed)) return visit;
  }
  if (b.completed_at) return b.completed_at.slice(0, 10);
  return b.date ?? null;
}

const { data: payouts } = await admin
  .from("cleaner_payouts")
  .select("id, period_start, period_end, total_amount_cents, status")
  .gte("period_end", "2026-06-01")
  .neq("status", "cancelled");

let unlinked = 0;
const touchedPayoutIds = new Set();

for (const p of payouts ?? []) {
  const { data: bk } = await admin
    .from("bookings")
    .select(
      "id, date, completed_at, customer_name, billing_type, payment_status, monthly_invoice_id, is_monthly_billing_booking, cleaner_payout_cents, cleaner_bonus_cents",
    )
    .eq("payout_id", p.id);

  for (const b of bk ?? []) {
    const day = batchDay(b);
    if (!day || day < p.period_start || day > p.period_end) {
      const { error } = await admin.from("bookings").update({ payout_id: null }).eq("id", b.id);
      if (error) {
        console.error("unlink failed", b.id, error.message);
        continue;
      }
      unlinked++;
      touchedPayoutIds.add(p.id);
      console.log(`Unlinked ${b.date} ${b.customer_name} from payout ${p.id.slice(0, 8)} (${p.period_start}–${p.period_end})`);
    }
  }
}

console.log(`\nUnlinked ${unlinked} booking(s) from ${touchedPayoutIds.size} payout batch(es).`);

for (const payoutId of touchedPayoutIds) {
  const p = payouts?.find((x) => x.id === payoutId);
  const { data: remaining } = await admin
    .from("bookings")
    .select("cleaner_payout_cents, cleaner_bonus_cents")
    .eq("payout_id", payoutId);

  const count = remaining?.length ?? 0;
  if (count === 0) {
    if (p?.status === "paid") {
      console.log(`Skip delete paid empty batch ${payoutId.slice(0, 8)}`);
      continue;
    }
    await admin.from("cleaner_payouts").delete().eq("id", payoutId);
    console.log(`Deleted empty payout batch ${payoutId.slice(0, 8)} (${p?.period_start}–${p?.period_end})`);
    continue;
  }

  const total = (remaining ?? []).reduce(
    (s, b) => s + Math.round(Number(b.cleaner_payout_cents ?? 0)) + Math.round(Number(b.cleaner_bonus_cents ?? 0)),
    0,
  );
  await admin.from("cleaner_payouts").update({ total_amount_cents: total }).eq("id", payoutId);
  console.log(`Updated payout ${payoutId.slice(0, 8)} total → R ${(total / 100).toFixed(2)} (${count} jobs)`);
}

console.log("\nDone. Re-run Generate weekly payouts to rebuild May week batches.");
