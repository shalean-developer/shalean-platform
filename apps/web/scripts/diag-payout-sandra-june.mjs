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

const { data: payout } = await admin
  .from("cleaner_payouts")
  .select("*, cleaners(full_name)")
  .eq("id", PAYOUT_ID)
  .maybeSingle();

console.log("=== Payout batch ===");
console.log(JSON.stringify(payout, null, 2));

const { data: linked } = await admin
  .from("bookings")
  .select(
    "id, date, status, customer_name, recurring_id, monthly_invoice_id, cleaner_id, payout_id, payout_status, cleaner_payout_cents, display_earnings_cents, payout_frozen_cents, total_paid_zar, is_recurring_generated",
  )
  .eq("payout_id", PAYOUT_ID)
  .order("date");

console.log(`\n=== Linked bookings (${linked?.length ?? 0}) ===`);
for (const b of linked ?? []) {
  console.log(
    `${b.date} ${b.status} ${(b.customer_name ?? "?").padEnd(16)} payout=R${((b.cleaner_payout_cents ?? b.display_earnings_cents ?? 0) / 100).toFixed(2)} recurring=${b.recurring_id?.slice(0, 8) ?? "—"}`,
  );
}

// Sandra recurring + June visits
const { data: profiles } = await admin.from("user_profiles").select("id, full_name").ilike("full_name", "%Sandra%");
const sandraProfile = profiles?.find((p) => String(p.full_name).toLowerCase().includes("sand"));
console.log("\n=== Sandra profile ===", sandraProfile);

if (sandraProfile?.id) {
  const { data: plans } = await admin
    .from("recurring_bookings")
    .select("id, frequency, days_of_week, price, status, customer_id")
    .eq("customer_id", sandraProfile.id);
  console.log("Recurring plans:", plans);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  const { data: sandraJune } = await admin
    .from("bookings")
    .select(
      "id, date, status, customer_name, cleaner_id, recurring_id, payout_id, payout_status, cleaner_payout_cents, display_earnings_cents, cleaners(full_name)",
    )
    .eq("user_id", sandraProfile.id)
    .gte("date", "2026-06-01")
    .lte("date", today)
    .neq("status", "cancelled")
    .order("date");

  console.log(`\n=== Sandra June bookings 1 Jun – ${today} (${sandraJune?.length ?? 0}) ===`);
  for (const b of sandraJune ?? []) {
    const cleaner = b.cleaners?.full_name ?? b.cleaner_id?.slice(0, 8);
    console.log(
      `${b.date} ${b.status.padEnd(10)} cleaner=${cleaner} payout_id=${b.payout_id?.slice(0, 8) ?? "null"} R${((b.cleaner_payout_cents ?? b.display_earnings_cents ?? 0) / 100).toFixed(2)}`,
    );
  }
}

// Cleaner on this payout
if (payout?.cleaner_id) {
  const { data: cleanerJuneSandra } = await admin
    .from("bookings")
    .select("id, date, status, customer_name, payout_id, cleaner_payout_cents, display_earnings_cents")
    .eq("cleaner_id", payout.cleaner_id)
    .ilike("customer_name", "%Sandra%")
    .gte("date", "2026-06-01")
    .lte("date", "2026-06-30")
    .neq("status", "cancelled")
    .order("date");
  console.log(`\n=== Payout cleaner's Sandra June visits (${cleanerJuneSandra?.length ?? 0}) ===`);
  for (const b of cleanerJuneSandra ?? []) {
    console.log(`${b.date} ${b.status} payout_id=${b.payout_id?.slice(0, 8) ?? "null"} linked=${b.payout_id === PAYOUT_ID}`);
  }
}
