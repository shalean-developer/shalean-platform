/**
 * OFFICE-BILLING-E2E-06D — bounded initial-email recovery for sent invoices.
 *
 * Dry-run by default.
 * Apply requires --apply --confirm=OFFICE-BILLING-E2E-06D
 *
 * This script NEVER initializes Paystack and NEVER creates Zoho invoices.
 * It requires each frozen target to already be sent with a Paystack link/ref
 * and a linked Zoho invoice, and to have no initial-email event yet.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { formatDueDateLabel, formatMonthLongYearUtc } from "../lib/admin/invoices/invoiceAdminFormatters";
import { readCustomerProfileContact } from "../lib/customer/readCustomerProfileContact";
import {
  appendMonthlyInvoiceSnapshotEvent,
  invoicePaymentLinkEmailSentExists,
} from "../lib/monthlyInvoice/invoiceSnapshotEvents";
import { resolveMonthlyInvoiceCustomerEmail } from "../lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { sendMonthlyInvoiceEmail } from "../lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { trustMonthlyInvoicePayPageUrl } from "../lib/pay/trustPayPageUrl";
import { markZohoInvoiceSent } from "../lib/zoho/zohoBooksService";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-06D";

const TARGET_IDS = [
  "21333f4a-4760-403f-9761-79ededbe8c0c",
  "36c8f4db-ee8b-4357-b856-2c669a66afc2",
  "37e728fa-ad59-4c6b-ad04-9790ba55c96e",
  "3d2ad4ee-cba8-48ac-8177-f0ca71f4a608",
  "49ce355a-ad9d-4c0d-8d28-29c979e1e652",
  "4effde1e-c1c1-41d0-ae8d-76f312642913",
  "61a04a66-106d-4d51-8c49-08fd948ed55b",
  "7d63403e-37b2-42d7-83ee-68d5751e7924"
] as const;

type Row = {
  id: string;
  customer_id: string;
  month: string;
  due_date: string | null;
  status: string | null;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  paystack_reference: string | null;
  payment_link: string | null;
  zoho_invoice_id: string | null;
  initial_invoice_email_dispatch_claimed: boolean | null;
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
  if (!String(process.env.RESEND_API_KEY ?? "").trim()) fail("RESEND_API_KEY missing");
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }
  if (apply && confirm !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, total_amount_cents, amount_paid_cents, paystack_reference, payment_link, zoho_invoice_id, initial_invoice_email_dispatch_claimed")
    .in("id", [...TARGET_IDS]);

  if (error) fail(error.message);
  if ((data ?? []).length !== TARGET_IDS.length) fail(`expected ${TARGET_IDS.length} rows; found ${data?.length ?? 0}`);

  const byId = new Map((data as Row[]).map((r) => [r.id, r]));

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "sent") fail(`${id} status=${row.status}`);
    if (!String(row.paystack_reference ?? "").trim()) fail(`${id} missing Paystack reference`);
    if (!String(row.payment_link ?? "").trim()) fail(`${id} missing payment link`);
    if (!String(row.zoho_invoice_id ?? "").trim()) fail(`${id} missing Zoho invoice`);
    if (row.initial_invoice_email_dispatch_claimed === true) fail(`${id} email dispatch already claimed`);
    if (await invoicePaymentLinkEmailSentExists(admin, id)) fail(`${id} initial email event already exists`);

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!email) fail(`${id} outbound email missing`);
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} sent=${TARGET_IDS.length} paystack=${TARGET_IDS.length} zoho=${TARGET_IDS.length} outbound_emails=${TARGET_IDS.length} env=production resend=SET`);
  console.log(apply ? "MODE=APPLY" : "MODE=DRY_RUN");

  if (!apply) {
    for (const id of TARGET_IDS) console.log(`[dry-run] would send missing initial invoice email ${id.slice(0, 8)}`);
    console.log("OFFICE_BILLING_E2E_06D_DRY_RUN_COMPLETE");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const id of TARGET_IDS) {
    const row = byId.get(id)!;

    const { data: claimRows, error: claimErr } = await admin
      .from("monthly_invoices")
      .update({ initial_invoice_email_dispatch_claimed: true })
      .eq("id", row.id)
      .eq("status", "sent")
      .eq("initial_invoice_email_dispatch_claimed", false)
      .select("id");

    if (claimErr || !claimRows?.length) {
      failed += 1;
      console.error(`${row.id}: email claim failed — ${claimErr?.message ?? "no row claimed"}`);
      continue;
    }

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });

    if (!email) {
      failed += 1;
      await admin.from("monthly_invoices").update({ initial_invoice_email_dispatch_claimed: false }).eq("id", row.id);
      console.error(`${row.id}: outbound email disappeared`);
      continue;
    }

    const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
    const paid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
    const balanceZar = Math.max(0, total - paid) / 100;
    const paystackRef = String(row.paystack_reference ?? "").trim();
    const paystackLink = String(row.payment_link ?? "").trim();
    const brandedPayUrl = trustMonthlyInvoicePayPageUrl(row.id, paystackRef, paystackLink);
    const customerName = (await readCustomerProfileContact(admin, row.customer_id)).fullName;

    const mail = await sendMonthlyInvoiceEmail({
      to: email,
      customerName,
      monthLabel: formatMonthLongYearUtc(row.month),
      month: row.month,
      totalZar: balanceZar,
      paymentUrl: brandedPayUrl,
      paystackPaymentUrl: paystackLink,
      dueDateLabel: formatDueDateLabel(row.due_date),
      zohoInvoiceId: row.zoho_invoice_id,
    });

    if (!mail.sent) {
      failed += 1;
      await admin.from("monthly_invoices").update({ initial_invoice_email_dispatch_claimed: false }).eq("id", row.id);
      console.error(`${row.id}: email failed — ${mail.error ?? "email_send_failed"}`);
      continue;
    }

    const sentAt = new Date().toISOString();
    const ev = await appendMonthlyInvoiceSnapshotEvent(
      admin,
      row.id,
      {
        kind: "invoice_payment_link_email_sent",
        at: sentAt,
        actor: "script/office-billing-e2e-06d",
        paystack_reference: paystackRef,
      },
      { source: "script/office-billing-e2e-06d" },
    );

    if (!ev.ok) {
      failed += 1;
      await admin.from("monthly_invoices").update({ initial_invoice_email_dispatch_claimed: false }).eq("id", row.id);
      console.error(`${row.id}: email sent but event append failed — ${ev.error}`);
      continue;
    }

    await admin
      .from("monthly_invoices")
      .update({ sent_at: sentAt })
      .eq("id", row.id)
      .eq("status", "sent");

    await markZohoInvoiceSent(String(row.zoho_invoice_id));

    sent += 1;
    console.log(`${row.id}: initial invoice email sent`);
  }

  console.log(`SUMMARY emailed=${sent} failed=${failed}`);
  console.log("OFFICE_BILLING_E2E_06D_APPLY_COMPLETE");
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
