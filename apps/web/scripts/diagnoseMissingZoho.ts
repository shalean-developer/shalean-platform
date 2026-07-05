/**
 * Diagnose rows shown as "missing Zoho" on /office/billing.
 * Run: npx tsx --env-file=.env.local --conditions=react-server scripts/diagnoseMissingZoho.ts
 */

import { createClient } from "@supabase/supabase-js";

import { loadAdminBillingDocuments } from "../lib/admin/billing/loadAdminBillingDocuments";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const payload = await loadAdminBillingDocuments(admin, { kind: "missing_zoho" });
  const missing = payload.documents;

  console.log("Missing Zoho (UI filter):", missing.length);
  console.log("Summary by kind:", JSON.stringify(payload.summary.by_kind, null, 2));

  const byKind = new Map<string, typeof missing>();
  for (const d of missing) {
    const arr = byKind.get(d.kind) ?? [];
    arr.push(d);
    byKind.set(d.kind, arr);
  }

  for (const [kind, rows] of byKind) {
    console.log(`\n=== ${kind}: ${rows.length} ===`);
    const statusCounts: Record<string, number> = {};
    for (const r of rows) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }
    console.log("Statuses:", statusCounts);
    for (const r of rows.slice(0, 12)) {
      console.log(
        `  ${r.id.slice(0, 8)} | ${r.status} | ${(r.amount_cents / 100).toFixed(0)} ZAR | ${r.customer_email || "(no email)"}`,
      );
    }
  }

  const { data: requested } = await admin
    .from("sales_documents")
    .select("id, status, total_cents, zoho_estimate_id, source")
    .eq("status", "requested");
  console.log("\nQuote requests (status=requested, excluded from sync):", requested?.length ?? 0);

  const { data: sd } = await admin
    .from("sales_documents")
    .select("id, document_type, status, total_cents, zoho_estimate_id, zoho_invoice_id")
    .gt("total_cents", 0);
  const sdMissing = (sd ?? []).filter((r) => {
    if (r.document_type === "quote") return !String(r.zoho_estimate_id ?? "").trim();
    return !String(r.zoho_invoice_id ?? "").trim();
  });
  console.log("Priced sales documents missing Zoho:", sdMissing.length);

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, payment_status, zoho_invoice_id, sales_document_id, is_monthly_billing_booking, payment_method")
    .is("zoho_invoice_id", null)
    .not("payment_completed_at", "is", null);
  const bookingMissing = (bookings ?? []).filter(
    (b) =>
      b.is_monthly_billing_booking !== true &&
      !String(b.sales_document_id ?? "").trim() &&
      String(b.payment_method ?? "").toLowerCase() !== "zoho",
  );
  console.log("Paid bookings still missing zoho_invoice_id:", bookingMissing.length);

  const { data: monthly } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, zoho_invoice_id")
    .is("zoho_invoice_id", null)
    .gt("total_amount_cents", 0);
  console.log("Monthly invoices missing zoho (with balance):", monthly?.length ?? 0);
  if (monthly?.length) {
    const st: Record<string, number> = {};
    for (const m of monthly) st[String(m.status)] = (st[String(m.status)] ?? 0) + 1;
    console.log("  statuses:", st);
  }
}

void main();
