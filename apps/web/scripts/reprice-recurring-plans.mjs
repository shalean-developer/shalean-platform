/**
 * Reprice draft-invoice recurring visits to match plan.price (local repair).
 * Run: node apps/web/scripts/reprice-recurring-plans.mjs
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: plans } = await admin.from("recurring_bookings").select("id, price, status").neq("status", "cancelled");
  let repriced = 0;
  const invoiceIds = new Set();

  for (const plan of plans ?? []) {
    const planPrice = Math.round(Number(plan.price));
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, total_paid_zar, monthly_invoice_id, monthly_invoices(status)")
      .eq("recurring_id", plan.id)
      .neq("status", "cancelled");

    for (const b of bookings ?? []) {
      const inv = b.monthly_invoices;
      const invStatus =
        inv && typeof inv === "object" && !Array.isArray(inv) ? String(inv.status ?? "").toLowerCase() : "";
      if (invStatus !== "draft") continue;
      const current = Math.round(Number(b.total_paid_zar ?? 0));
      if (current === planPrice) continue;

      const { error } = await admin.from("bookings").update({ total_paid_zar: planPrice }).eq("id", b.id);
      if (error) {
        console.error(`Booking ${b.id}: ${error.message}`);
        continue;
      }
      repriced++;
      if (b.monthly_invoice_id) invoiceIds.add(b.monthly_invoice_id);
      console.log(`  ${plan.id.slice(0, 8)} booking ${String(b.id).slice(0, 8)}: R${current} → R${planPrice}`);
    }
  }

  for (const invoiceId of invoiceIds) {
    const { error } = await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: invoiceId });
    if (error) console.error(`Invoice ${invoiceId}: ${error.message}`);
  }

  console.log(`\nDone: ${repriced} booking(s) repriced, ${invoiceIds.size} invoice(s) recomputed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
