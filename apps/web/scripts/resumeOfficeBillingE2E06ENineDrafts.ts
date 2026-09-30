/**
 * OFFICE-BILLING-E2E-06E — bounded resume for the nine remaining ready drafts.
 *
 * Dry-run by default.
 * Apply requires --apply --confirm=OFFICE-BILLING-E2E-06E
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getDefaultFromAddress } from "../lib/email/resendFrom";
import { resolveMonthlyInvoiceCustomerEmail } from "../lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-06E";
const TARGET_IDS = [
  "80eaae10-ec1d-45a5-a90d-4c34eda12b33",
  "8960a72b-cd8d-4149-b292-8d375596ffc1",
  "9f4836db-5ad4-43c7-8e19-2f8b5a8c8cdb",
  "b223ce4e-eea9-4bcc-8915-b5f135aa6e21",
  "b7c14219-1443-43fc-93be-0a41f091297a",
  "c347e67d-5ad4-41d6-90f9-1d6d1cfe4c1a",
  "e2c6492b-2324-4d43-baa8-dc52d8688100",
  "ed9ee326-e363-489b-a8fe-aec588946165",
  "f8bfcf5d-efbf-4113-bd26-fd25d56a39d0"
] as const;

type Row = {
  id: string;
  customer_id: string;
  month: string;
  status: string | null;
  total_amount_cents: number | null;
  paystack_reference: string | null;
  payment_link: string | null;
  zoho_invoice_id: string | null;
  sent_at: string | null;
  finalized_at: string | null;
  initial_invoice_email_dispatch_claimed: boolean | null;
  snapshot_at_finalize: unknown;
  snapshot_current: unknown;
};

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
  if (String(process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase() !== "production") {
    fail("SHALEAN_APP_ENV must be production");
  }
  if (!String(process.env.PAYSTACK_SECRET_KEY ?? "").trim()) fail("PAYSTACK_SECRET_KEY missing");
  if (!String(process.env.RESEND_API_KEY ?? "").trim()) fail("RESEND_API_KEY missing");
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }

  const from = getDefaultFromAddress();
  if (!/@shalean\.co\.za>?$/i.test(from.trim())) {
    fail(`RESEND_FROM is not using verified shalean.co.za domain: ${from}`);
  }

  if (apply && confirm !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, paystack_reference, payment_link, zoho_invoice_id, sent_at, finalized_at, initial_invoice_email_dispatch_claimed, snapshot_at_finalize, snapshot_current")
    .in("id", [...TARGET_IDS]);

  if (error) fail(error.message);
  if ((data ?? []).length !== TARGET_IDS.length) fail(`expected ${TARGET_IDS.length} rows; found ${data?.length ?? 0}`);

  const rows = data as Row[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "draft") fail(`${id} status=${row.status}`);
    if (Math.round(Number(row.total_amount_cents ?? 0)) <= 0) fail(`${id} non-positive total`);
    if (String(row.month ?? "") !== "2026-09") fail(`${id} unexpected month=${row.month}`);
    if (String(row.paystack_reference ?? "").trim()) fail(`${id} already has Paystack reference`);
    if (String(row.payment_link ?? "").trim()) fail(`${id} already has payment link`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`${id} already has Zoho invoice`);
    if (row.sent_at || row.finalized_at) fail(`${id} already has sent/finalized timestamp`);
    if (row.initial_invoice_email_dispatch_claimed === true) fail(`${id} has active email claim`);
    if (row.snapshot_at_finalize == null || row.snapshot_current == null) fail(`${id} missing partial finalization snapshot`);

    const { data: events, error: eventErr } = await admin
      .from("monthly_invoice_events")
      .select("id, kind")
      .eq("invoice_id", id);
    if (eventErr) fail(`${id} event query failed: ${eventErr.message}`);

    const finalizedCount = (events ?? []).filter((e) => e.kind === "invoice_finalized").length;
    const emailCount = (events ?? []).filter((e) => e.kind === "invoice_payment_link_email_sent").length;
    if (finalizedCount !== 1 || emailCount !== 0) {
      fail(`${id} unexpected events finalized=${finalizedCount} email=${emailCount}`);
    }

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!email) fail(`${id} outbound email missing`);

    const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!contact.ok) fail(`${id} Zoho contact resolution failed: ${contact.error}`);
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} drafts=${TARGET_IDS.length} positive=${TARGET_IDS.length} partial_snapshots=${TARGET_IDS.length} outbound_emails=${TARGET_IDS.length} zoho_contacts=${TARGET_IDS.length} env=production paystack=SET resend=SET from_verified=YES`);
  console.log(apply ? "MODE=APPLY" : "MODE=DRY_RUN");

  if (!apply) {
    for (const id of TARGET_IDS) {
      const row = byId.get(id)!;
      console.log(`[dry-run] would resume finalize/send ${id.slice(0, 8)} — ${row.month} — R${(Math.round(Number(row.total_amount_cents ?? 0))/100).toFixed(2)}`);
    }
    console.log("OFFICE_BILLING_E2E_06E_DRY_RUN_COMPLETE");
    return;
  }

  fail(
    "APPLY_DISABLED_NO_CUSTOMER_EMAILS: E2E-06E is read-only while customer email delivery is paused. Use a separately reviewed no-email recovery path."
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
