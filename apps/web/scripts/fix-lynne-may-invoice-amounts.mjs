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
const MAY_INVOICE_ID = "1b3ceaad-6e2a-428b-a3a7-08402414814c";
const VISIT_TOTAL_PAID_ZAR = 610;
const VISIT_AMOUNT_PAID_CENTS = 61000;

function buildPriceSnapshot() {
  return {
    v: 1,
    service_type: "standard",
    base_price: 609.62,
    extras: [],
    total_price: 609.62,
    version: "admin_recurring_repricing_may",
    repriced_at: new Date().toISOString(),
    repriced_by: "ops_script",
  };
}

async function main() {
  const { data: invBefore } = await admin
    .from("monthly_invoices")
    .select("status, total_amount_cents, amount_paid_cents")
    .eq("id", MAY_INVOICE_ID)
    .single();

  if (!invBefore) throw new Error("May invoice not found");
  console.log("Before:", invBefore);

  if (invBefore.status !== "draft") {
    const { error: draftErr } = await admin.from("monthly_invoices").update({ status: "draft" }).eq("id", MAY_INVOICE_ID);
    if (draftErr) throw new Error(`Could not set invoice to draft: ${draftErr.message}`);
    console.log("Set May invoice to draft for booking amount repair.");
  }

  const { data: bookings, error: bkErr } = await admin
    .from("bookings")
    .select("id, date, total_paid_zar, amount_paid_cents")
    .eq("recurring_id", PLAN_ID)
    .eq("is_recurring_generated", true)
    .eq("monthly_invoice_id", MAY_INVOICE_ID)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31")
    .order("date");
  if (bkErr) throw new Error(bkErr.message);
  if (!bookings?.length) throw new Error("No May recurring bookings found on May invoice");

  for (const b of bookings) {
    const { error } = await admin
      .from("bookings")
      .update({
        total_paid_zar: VISIT_TOTAL_PAID_ZAR,
        amount_paid_cents: VISIT_AMOUNT_PAID_CENTS,
        price_snapshot: buildPriceSnapshot(),
      })
      .eq("id", b.id);
    if (error) throw new Error(`${b.date}: ${error.message}`);
    console.log(`Updated ${b.date} → R ${VISIT_TOTAL_PAID_ZAR}`);
  }

  const { error: recomputeErr } = await admin.rpc("recompute_monthly_invoice_totals", {
    p_invoice_id: MAY_INVOICE_ID,
  });
  if (recomputeErr) throw new Error(`Recompute failed: ${recomputeErr.message}`);

  const { data: invDraft } = await admin
    .from("monthly_invoices")
    .select("total_amount_cents, total_bookings, balance_cents, amount_paid_cents")
    .eq("id", MAY_INVOICE_ID)
    .single();
  console.log("After recompute:", invDraft);

  const paidTotal = invDraft?.total_amount_cents ?? 0;
  const { error: paidErr } = await admin
    .from("monthly_invoices")
    .update({
      status: "paid",
      amount_paid_cents: paidTotal,
      balance_cents: 0,
    })
    .eq("id", MAY_INVOICE_ID);
  if (paidErr) {
    console.warn("Paid restore with balance_cents failed (generated column?):", paidErr.message);
    const { error: paidErr2 } = await admin
      .from("monthly_invoices")
      .update({ status: "paid", amount_paid_cents: paidTotal })
      .eq("id", MAY_INVOICE_ID);
    if (paidErr2) throw new Error(`Restore paid failed: ${paidErr2.message}`);
  }

  const { data: verifyBk } = await admin
    .from("bookings")
    .select("date, total_paid_zar, amount_paid_cents, is_recurring_generated")
    .eq("monthly_invoice_id", MAY_INVOICE_ID)
    .order("date");
  const { data: verifyInv } = await admin
    .from("monthly_invoices")
    .select("status, total_amount_cents, amount_paid_cents, balance_cents, total_bookings")
    .eq("id", MAY_INVOICE_ID)
    .single();

  console.log("\nBookings:", verifyBk);
  console.log("Invoice:", verifyInv);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
