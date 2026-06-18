import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PLAN_ID = "a053ea81-185e-4434-9851-9619ee79f1a2";

async function main() {
  const { data: plan } = await admin
    .from("recurring_bookings")
    .select("id, price, booking_snapshot_template, status")
    .eq("id", PLAN_ID)
    .single();
  console.log("Plan price:", plan?.price);

  const { data: june } = await admin
    .from("bookings")
    .select(
      "id, date, status, total_paid_zar, amount_paid_cents, total_price, base_amount_cents, price_snapshot, payment_status, cleaner_line_earnings_finalized_at",
    )
    .eq("recurring_id", PLAN_ID)
    .gte("date", "2026-06-01")
    .order("date")
    .limit(3);
  console.log("\nJune sample:", june);

  const { data: all } = await admin
    .from("bookings")
    .select("total_paid_zar, status, cleaner_line_earnings_finalized_at")
    .eq("recurring_id", PLAN_ID)
    .gte("date", "2026-06-01");
  const prices = [...new Set((all ?? []).map((b) => b.total_paid_zar))];
  console.log("\nDistinct June prices:", prices);
  console.log("June count:", all?.length);
}

main();
