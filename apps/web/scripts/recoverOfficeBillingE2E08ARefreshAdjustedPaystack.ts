/**
 * OFFICE-BILLING-E2E-08A — refresh stale Paystack links after post-send adjustments.
 *
 * Dry-run by default.
 * Apply requires --apply --confirm=OFFICE-BILLING-E2E-08A
 *
 * No customer email sender is imported or called.
 * No Zoho invoice is created or replaced.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { initializePaystackForMonthlyInvoice } from "../lib/monthlyInvoice/initializePaystackForMonthlyInvoice";
import { parseBalanceSuffixFromPaystackReference } from "../lib/monthlyInvoice/monthlyInvoiceAmountIntegrity";
import { resolveMonthlyInvoiceCustomerEmail } from "../lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-08A";
const TARGET_IDS = [
  "d86549b5-e342-45b3-87d4-07d737e5bf67",
  "eb31becd-0873-403b-80e0-250a2648ca69"
] as const;

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirm = process.argv.find((x) => x.startsWith("--confirm="))?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail("refusing non-production Supabase URL");
  if (String(process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase() !== "production") fail("SHALEAN_APP_ENV must be production");
  if (!String(process.env.PAYSTACK_SECRET_KEY ?? "").trim()) fail("PAYSTACK_SECRET_KEY missing");
  if (apply && confirm !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, balance_cents, paystack_reference, payment_link, zoho_invoice_id, initial_invoice_email_dispatch_claimed")
    .in("id", [...TARGET_IDS]);

  if (error) fail(error.message);
  if ((data ?? []).length !== TARGET_IDS.length) fail(`expected ${TARGET_IDS.length} rows; found ${data?.length ?? 0}`);

  const byId = new Map((data ?? []).map((r) => [String(r.id), r as Record<string, unknown>]));

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing ${id}`);
    const status = String(row.status ?? "").toLowerCase();
    if (!["sent","partially_paid","overdue"].includes(status)) fail(`${id} status=${status}`);
    if (!String(row.zoho_invoice_id ?? "").trim()) fail(`${id} missing Zoho link`);
    if (String(row.payment_link ?? "").trim()) fail(`${id} already has active payment link`);
    if (!String(row.paystack_reference ?? "").trim()) fail(`${id} missing existing Paystack reference`);
    const { count: emailEventCount, error: emailEventErr } = await admin
      .from("monthly_invoice_events")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", id)
      .eq("kind", "invoice_payment_link_email_sent");
    if (emailEventErr) fail(`${id} email-event query failed: ${emailEventErr.message}`);
    if ((emailEventCount ?? 0) !== 1) {
      fail(`${id} expected one historical initial-email event; found ${emailEventCount ?? 0}`);
    }

    const balance = Math.max(0, Math.round(Number(row.balance_cents ?? 0)));
    if (balance <= 0) fail(`${id} has no remaining balance`);

    const oldRef = String(row.paystack_reference ?? "").trim();
    const oldBound = parseBalanceSuffixFromPaystackReference(oldRef);
    if (oldBound === balance) fail(`${id} reference is already bound to current balance`);

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: String(row.customer_id),
      invoiceId: id,
    });
    if (!email) fail(`${id} customer email missing for Paystack metadata`);

    console.log(`READY ${id.slice(0,8)} old_balance_suffix=${oldBound ?? "none"} current_balance=${balance}`);
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} stale_links=${TARGET_IDS.length} customer_email_delivery=DISABLED`);
  console.log(apply ? "MODE=APPLY_NO_EMAIL" : "MODE=DRY_RUN_NO_EMAIL");

  if (!apply) {
    for (const id of TARGET_IDS) {
      console.log(`[dry-run] would rotate stale Paystack reference and create current-balance payment link ${id.slice(0,8)}`);
    }
    console.log("OFFICE_BILLING_E2E_08A_DRY_RUN_COMPLETE");
    return;
  }

  let refreshed = 0;
  let failed = 0;

  for (const id of TARGET_IDS) {
    const row = byId.get(id)!;
    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: String(row.customer_id),
      invoiceId: id,
    });
    if (!email) {
      failed += 1;
      console.error(`${id}: customer email missing before Paystack init`);
      continue;
    }

    const pay = await initializePaystackForMonthlyInvoice(admin, {
      invoiceId: id,
      customerEmail: email,
    });

    if (!pay.ok) {
      failed += 1;
      console.error(`${id}: Paystack refresh failed — ${pay.error}`);
      continue;
    }

    refreshed += 1;
    console.log(`${id}: Paystack link refreshed; customer email NOT sent`);
  }

  console.log(`SUMMARY refreshed=${refreshed} failed=${failed} customer_emails_sent=0 zoho_created=0`);
  console.log("OFFICE_BILLING_E2E_08A_APPLY_COMPLETE");
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
