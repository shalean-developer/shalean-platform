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

const { data: inv } = await admin
  .from("monthly_invoices")
  .select("id, total_amount_cents, total_bookings, status, month")
  .eq("month", "2026-06")
  .eq("status", "draft");

for (const i of inv ?? []) {
  const { data: bk } = await admin
    .from("bookings")
    .select("id, date, status, total_paid_zar, amount_paid_cents, total_paid_cents, customer_name")
    .eq("monthly_invoice_id", i.id);
  const sumZar = (bk ?? []).filter((b) => b.status !== "cancelled").reduce((s, b) => s + Number(b.total_paid_zar ?? 0), 0);
  const sumAmt = (bk ?? []).filter((b) => b.status !== "cancelled").reduce((s, b) => s + Number(b.amount_paid_cents ?? 0), 0);
  if (Math.round(Number(i.total_amount_cents)) !== Math.round(sumZar * 100) && Math.abs(Number(i.total_amount_cents) - sumZar * 100) > 100) {
    const name = bk?.[0]?.customer_name ?? "?";
    console.log(`\n${name} inv=${i.id.slice(0, 8)} total=${i.total_amount_cents} bookings=${i.total_bookings}`);
    console.log(`  sum total_paid_zar*100=${Math.round(sumZar * 100)} sum amount_paid_cents=${sumAmt}`);
    for (const b of bk ?? []) {
      if (b.status !== "cancelled") {
        console.log(`  ${b.date} zar=${b.total_paid_zar} amt_cents=${b.amount_paid_cents}`);
      }
    }
  }
}

const { data: adj } = await admin
  .from("invoice_adjustments")
  .select("*")
  .eq("month_applied", "2026-06")
  .limit(10);
console.log("\nJune adjustments:", adj?.length ?? 0, adj);
