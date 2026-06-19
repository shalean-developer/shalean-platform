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

const { data: eligible } = await admin
  .from("bookings")
  .select(
    "id, date, payout_status, payout_id, cleaner_payout_cents, payout_frozen_cents, display_earnings_cents, payment_status, monthly_invoice_id, billing_type, is_monthly_billing_booking",
  )
  .eq("payout_status", "eligible");

const reasons = {};
for (const b of eligible ?? []) {
  let reason = "ok_for_batch";
  if (b.payout_id) reason = "already_has_payout_id";
  else if (!b.cleaner_payout_cents || b.cleaner_payout_cents <= 0) reason = "missing_cleaner_payout_cents";
  else if (String(b.payment_status).toLowerCase() !== "success") reason = "payment_status_not_success";
  else if (!b.payout_frozen_cents || b.payout_frozen_cents <= 0) reason = "missing_payout_frozen";
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

console.log("Eligible bookings by batch-readiness:", reasons);
console.log("Total eligible:", eligible?.length);

const { count: batchCount } = await admin.from("cleaner_payouts").select("id", { count: "exact", head: true });
console.log("Payout batches:", batchCount);

const { data: linked } = await admin.from("bookings").select("id", { count: "exact", head: true }).not("payout_id", "is", null).eq("payout_status", "eligible");
console.log("Still eligible but have payout_id:", linked);
