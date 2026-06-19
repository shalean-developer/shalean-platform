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

const PAYOUT_ID = "6072323c-b1e3-42ba-86a4-b83e12f1182f";
const CLEANER_ID = "c0771cf5-3a83-4299-99ee-b0e399e8745f";

const { data: linked } = await admin
  .from("bookings")
  .select("id, date, completed_at, status, customer_name, payout_id, cleaner_payout_cents")
  .eq("payout_id", PAYOUT_ID);

console.log("Linked to payout - completion vs date:");
for (const b of linked ?? []) {
  console.log(`  date=${b.date} completed_at=${b.completed_at?.slice(0, 10) ?? "null"} ${b.customer_name}`);
}

// Mitchell unbatched eligible/completed in June
const { data: mitchellJune } = await admin
  .from("bookings")
  .select(
    "id, date, completed_at, status, customer_name, payout_id, payout_status, cleaner_payout_cents, display_earnings_cents, payment_status, monthly_invoice_id",
  )
  .eq("cleaner_id", CLEANER_ID)
  .gte("date", "2026-06-01")
  .lte("date", "2026-06-19")
  .neq("status", "cancelled")
  .order("date");

console.log("\nMitchell bookings Jun 1-19:");
for (const b of mitchellJune ?? []) {
  const comp = b.completed_at?.slice(0, 10) ?? "—";
  console.log(
    `${b.date} ${b.status.padEnd(10)} completed=${comp} payout=${b.payout_status} payout_id=${b.payout_id?.slice(0, 8) ?? "null"} ${b.customer_name} R${((b.cleaner_payout_cents ?? 0) / 100).toFixed(2)} pay=${b.payment_status}`,
  );
}

// Sandra only - completed count
const sandraCompleted = (mitchellJune ?? []).filter(
  (b) => String(b.customer_name).includes("Sandra") && b.status === "completed",
);
console.log(`\nSandra completed Jun 1-19: ${sandraCompleted.length}`);

// All Mitchell payouts for June period_end
const { data: junePayouts } = await admin
  .from("cleaner_payouts")
  .select("id, period_start, period_end, total_amount_cents, status")
  .eq("cleaner_id", CLEANER_ID)
  .gte("period_end", "2026-06-01")
  .order("period_start");

console.log("\nMitchell June-era payout batches:");
for (const p of junePayouts ?? []) {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("payout_id", p.id);
  console.log(`  ${p.period_start}–${p.period_end} R${(p.total_amount_cents / 100).toFixed(2)} status=${p.status} jobs=${count}`);
}
