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

function visitPriceCents(b) {
  const cents = b.amount_paid_cents ?? b.total_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) return Math.round(cents);
  const zarVal = b.total_paid_zar;
  if (typeof zarVal === "number" && Number.isFinite(zarVal) && zarVal > 0) return Math.round(zarVal * 100);
  return 0;
}

const ym = "2026-06";

const { data: profiles } = await admin.from("user_profiles").select("id, full_name");
const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

const { data: juneDrafts } = await admin
  .from("monthly_invoices")
  .select("id, customer_id, total_amount_cents, status, month")
  .eq("month", ym)
  .eq("status", "draft");

console.log("=== June draft invoice vs visits (all) ===\n");
for (const inv of juneDrafts ?? []) {
  const { data: visits } = await admin
    .from("bookings")
    .select("id, date, status, amount_paid_cents, total_paid_zar, total_paid_cents")
    .eq("monthly_invoice_id", inv.id)
    .neq("status", "cancelled");
  const visitSum = (visits ?? []).reduce((s, b) => s + visitPriceCents(b), 0);
  const invTotal = Math.round(Number(inv.total_amount_cents ?? 0));
  const diff = invTotal - visitSum;
  if (Math.abs(diff) > 0) {
    const name = (names.get(inv.customer_id) ?? inv.customer_id.slice(0, 8)).trim();
    console.log(`${name.padEnd(18)} invoice ${(invTotal / 100).toFixed(0).padStart(5)} | visits ${(visitSum / 100).toFixed(0).padStart(5)} | diff ${(diff / 100).toFixed(0).padStart(4)} | ${visits?.length ?? 0} bookings`);
  }
}

const { data: paidInvoices } = await admin.from("monthly_invoices").select("id, month, status").eq("status", "paid");
const paidIds = (paidInvoices ?? []).map((i) => i.id);

const { data: notEligible } = await admin
  .from("bookings")
  .select(
    "id, date, status, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_id, monthly_invoices(month, status)",
  )
  .in("monthly_invoice_id", paidIds)
  .neq("status", "cancelled")
  .neq("payout_status", "eligible")
  .neq("payout_status", "batched")
  .neq("payout_status", "paid");

console.log("\n=== Paid invoice bookings NOT payout-eligible ===\n");
for (const b of notEligible ?? []) {
  console.log(
    `${b.id.slice(0, 8)} ${b.date} status=${b.status} payout=${b.payout_status} frozen=${b.payout_frozen_cents} display=${b.display_earnings_cents} inv=${b.monthly_invoices?.month}`,
  );
}

const { data: adjustments } = await admin
  .from("invoice_adjustments")
  .select("id, customer_id, month, amount_cents, description, applied_to_invoice_id, invoice_id")
  .or("month.eq.2026-06,applied_to_invoice_id.not.is.null")
  .limit(50);

console.log("\n=== Invoice adjustments (June or applied) ===\n");
for (const a of adjustments ?? []) {
  console.log(
    `cust=${a.customer_id?.slice(0, 8)} month=${a.month} amt=${(Number(a.amount_cents) / 100).toFixed(2)} applied=${a.applied_to_invoice_id?.slice(0, 8) ?? "null"} inv=${a.invoice_id?.slice(0, 8) ?? "null"} ${a.description?.slice(0, 50) ?? ""}`,
  );
}

const lankyemInv = (juneDrafts ?? []).find((i) => Math.round(Number(i.total_amount_cents ?? 0)) === 188000);
if (lankyemInv) {
  const { data: allBk } = await admin
    .from("bookings")
    .select("id, date, status, amount_paid_cents, total_paid_zar, display_earnings_cents, cleaner_payout_cents")
    .eq("monthly_invoice_id", lankyemInv.id);
  console.log("\n=== Lankyem June invoice bookings (incl cancelled) ===\n");
  for (const b of allBk ?? []) {
    console.log(`${b.date} ${b.status} price=${visitPriceCents(b) / 100} display=${b.display_earnings_cents}`);
  }
}

const { data: stuckFull } = await admin
  .from("bookings")
  .select(
    "id, date, customer_name, monthly_invoice_id, payout_status, display_earnings_cents, cleaner_payout_cents, is_team_job, team_id, monthly_invoices(month, status)",
  )
  .in("monthly_invoice_id", paidIds)
  .eq("status", "completed")
  .eq("payout_status", "pending");

console.log("\n=== Completed on paid invoices, payout still pending ===\n");
for (const b of stuckFull ?? []) {
  console.log(
    `${(b.customer_name ?? "?").padEnd(16)} ${b.date} ${b.id.slice(0, 8)} inv=${b.monthly_invoice_id?.slice(0, 8)} display=${b.display_earnings_cents} payout=${b.cleaner_payout_cents} team=${b.is_team_job}`,
  );
}
