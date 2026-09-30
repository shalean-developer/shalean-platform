/**
 * OFFICE-BILLING-E2E-07D — bounded no-email recovery for one ready held invoice.
 *
 * Dry-run by default.
 * Apply requires --apply --confirm=OFFICE-BILLING-E2E-07D
 *
 * IMPORTANT: This script does not import or call any customer email sender.
 * It initializes Paystack and syncs Zoho only, then stops.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildMonthlyInvoiceSnapshot, wrapSnapshotCurrentV1 } from "../lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import { appendMonthlyInvoiceSnapshotEvent } from "../lib/monthlyInvoice/invoiceSnapshotEvents";
import { initializePaystackForMonthlyInvoice } from "../lib/monthlyInvoice/initializePaystackForMonthlyInvoice";
import { assessMonthlyInvoiceFinalizeReadiness } from "../lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { resolveMonthlyInvoiceCustomerEmail } from "../lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { syncMonthlyInvoiceToZohoBooks } from "../lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { trustMonthlyInvoicePayPageUrl } from "../lib/pay/trustPayPageUrl";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";
import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-07D";
const TARGET_IDS = [
  "a95f0cde-1ea7-4faf-bef0-865eca5ed7ee"
] as const;

type Row = {
  id: string;
  customer_id: string;
  month: string;
  status: string | null;
  total_amount_cents: number | null;
  due_date: string | null;
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

async function loadRows(admin: SupabaseClient): Promise<Row[]> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, due_date, paystack_reference, payment_link, zoho_invoice_id, sent_at, finalized_at, initial_invoice_email_dispatch_claimed, snapshot_at_finalize, snapshot_current")
    .in("id", [...TARGET_IDS]);

  if (error) fail(error.message);
  if ((data ?? []).length !== TARGET_IDS.length) {
    fail(`expected ${TARGET_IDS.length} rows; found ${data?.length ?? 0}`);
  }
  return data as Row[];
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
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }
  if (apply && confirm !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const rows = await loadRows(admin);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const readinessById = new Map<string, string>();

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "draft") fail(`${id} status=${row.status}`);
    if (String(row.month ?? "") !== "2026-09") fail(`${id} unexpected month=${row.month}`);
    if (Math.round(Number(row.total_amount_cents ?? 0)) <= 0) fail(`${id} non-positive total`);
    if (String(row.paystack_reference ?? "").trim()) fail(`${id} already has Paystack reference`);
    if (String(row.payment_link ?? "").trim()) fail(`${id} already has payment link`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`${id} already has Zoho invoice`);
    if (row.sent_at || row.finalized_at) fail(`${id} already has sent/finalized timestamp`);
    if (row.initial_invoice_email_dispatch_claimed === true) fail(`${id} has active email claim`);
    if (row.snapshot_at_finalize != null || row.snapshot_current != null) fail(`${id} already has finalization snapshot`);

    const { data: events, error: eventErr } = await admin
      .from("monthly_invoice_events")
      .select("kind")
      .eq("invoice_id", id);
    if (eventErr) fail(`${id} event query failed: ${eventErr.message}`);

    const finalizedCount = (events ?? []).filter((e) => e.kind === "invoice_finalized").length;
    const emailCount = (events ?? []).filter((e) => e.kind === "invoice_payment_link_email_sent").length;
    if (finalizedCount !== 0 || emailCount !== 0) {
      fail(`${id} unexpected events finalized=${finalizedCount} email=${emailCount}`);
    }

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!email) fail(`${id} customer email missing (required for Paystack initialization only)`);

    const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
      customerId: row.customer_id,
      invoiceId: row.id,
    });
    if (!contact.ok) fail(`${id} Zoho contact resolution failed: ${contact.error}`);

    const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
      invoiceId: row.id,
      customerId: row.customer_id,
      month: row.month,
      todayYmd: todayJohannesburg(),
    });
    if (!readiness.ready || !readiness.paymentDueDateYmd) {
      fail(`${id} not ready: ${readiness.reason ?? "unknown"}`);
    }
    readinessById.set(id, readiness.paymentDueDateYmd);
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} drafts=${TARGET_IDS.length} ready=${TARGET_IDS.length} fresh_snapshots=${TARGET_IDS.length} paystack=SET zoho=SET customer_email_delivery=DISABLED`);
  console.log(apply ? "MODE=APPLY_NO_EMAIL" : "MODE=DRY_RUN_NO_EMAIL");

  if (!apply) {
    for (const id of TARGET_IDS) {
      const row = byId.get(id)!;
      console.log(`[dry-run] would snapshot + initialize Paystack + sync Zoho only ${id.slice(0,8)} — R${(Math.round(Number(row.total_amount_cents ?? 0))/100).toFixed(2)} — due ${readinessById.get(id)}`);
    }
    console.log("OFFICE_BILLING_E2E_07D_DRY_RUN_COMPLETE");
    return;
  }

  let paystackInitialized = 0;
  let zohoSynced = 0;
  let failed = 0;

  for (const id of TARGET_IDS) {
    const original = byId.get(id)!;
    const dueDate = readinessById.get(id)!;

    const { error: recomputeErr } = await admin.rpc("recompute_monthly_invoice_totals", {
      p_invoice_id: id,
    });
    if (recomputeErr) {
      failed += 1;
      console.error(`${id}: recompute failed — ${recomputeErr.message}`);
      continue;
    }

    const { data: fresh, error: freshErr } = await admin
      .from("monthly_invoices")
      .select("id, customer_id, month, status, total_amount_cents, paystack_reference, payment_link, zoho_invoice_id")
      .eq("id", id)
      .maybeSingle();

    if (freshErr || !fresh) {
      failed += 1;
      console.error(`${id}: reload failed — ${freshErr?.message ?? "not_found"}`);
      continue;
    }
    if (String(fresh.status ?? "").toLowerCase() !== "draft") {
      failed += 1;
      console.error(`${id}: no longer draft after recompute`);
      continue;
    }

    const totalCents = Math.max(0, Math.round(Number(fresh.total_amount_cents ?? 0)));
    if (totalCents <= 0) {
      failed += 1;
      console.error(`${id}: non-positive total after recompute`);
      continue;
    }

    const { error: dueErr } = await admin
      .from("monthly_invoices")
      .update({ due_date: dueDate })
      .eq("id", id)
      .eq("status", "draft");
    if (dueErr) {
      failed += 1;
      console.error(`${id}: due-date update failed — ${dueErr.message}`);
      continue;
    }

    const snapshot = await buildMonthlyInvoiceSnapshot(admin, id);
    if (!snapshot) {
      failed += 1;
      console.error(`${id}: snapshot build failed`);
      continue;
    }

    const { data: snapRows, error: snapErr } = await admin
      .from("monthly_invoices")
      .update({
        snapshot_at_finalize: snapshot,
        snapshot_current: wrapSnapshotCurrentV1(snapshot),
        snapshot_version: 1,
      })
      .eq("id", id)
      .eq("status", "draft")
      .is("snapshot_at_finalize", null)
      .select("id");

    if (snapErr || !snapRows?.length) {
      failed += 1;
      console.error(`${id}: snapshot persist failed — ${snapErr?.message ?? "no row updated"}`);
      continue;
    }

    const finalizedEvent = await appendMonthlyInvoiceSnapshotEvent(
      admin,
      id,
      {
        kind: "invoice_finalized",
        at: new Date().toISOString(),
        total_amount_cents: totalCents,
        booking_count: Math.round(Number(snapshot.totals.total_bookings ?? 0)),
      },
      { source: "script/office-billing-e2e-07d" },
    );
    if (!finalizedEvent.ok) {
      failed += 1;
      console.error(`${id}: finalized event append failed — ${finalizedEvent.error}`);
      continue;
    }

    const email = await resolveMonthlyInvoiceCustomerEmail(admin, {
      customerId: original.customer_id,
      invoiceId: id,
    });
    if (!email) {
      failed += 1;
      console.error(`${id}: customer email disappeared before Paystack init`);
      continue;
    }

    const pay = await initializePaystackForMonthlyInvoice(admin, {
      invoiceId: id,
      customerEmail: email,
    });
    if (!pay.ok) {
      failed += 1;
      console.error(`${id}: Paystack init failed — ${pay.error}`);
      continue;
    }
    paystackInitialized += 1;

    const brandedPayUrl = trustMonthlyInvoicePayPageUrl(id, pay.reference, pay.authorizationUrl);

    const zoho = await syncMonthlyInvoiceToZohoBooks(admin, {
      invoiceId: id,
      customerId: original.customer_id,
      month: original.month,
      dueDate,
      balanceZar: totalCents / 100,
      paymentUrl: brandedPayUrl,
      status: "sent",
    });

    if (!zoho.ok) {
      failed += 1;
      console.error(`${id}: Zoho sync failed — ${zoho.error}`);
      continue;
    }
    zohoSynced += 1;

    console.log(`${id}: Paystack initialized + Zoho linked; customer email NOT sent`);
  }

  console.log(`SUMMARY paystack_initialized=${paystackInitialized} zoho_synced=${zohoSynced} failed=${failed} customer_emails_sent=0`);
  console.log("OFFICE_BILLING_E2E_07D_APPLY_COMPLETE");
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
