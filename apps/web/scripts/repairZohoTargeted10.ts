/**
 * INV-E2E-01D — targeted Zoho repair for the audited 10 genuinely missing invoices.
 *
 * Safety:
 * - dry-run by default
 * - --apply required for writes
 * - hardcoded allowlist only
 * - aborts if expected booking/monthly/sales-document invariants do not match
 * - does not send customer emails
 * - does not touch records outside the allowlist
 *
 * Run from apps/web:
 *   npm run repair:zoho-targeted-10
 *   npm run repair:zoho-targeted-10 -- --apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { markSyncSucceeded } from "../lib/accounting/accountingSyncQueue";
import { upsertInvoiceSyncMetadata } from "../lib/accounting/syncInvoiceMetadata";
import { syncMonthlyInvoiceToZohoBooks } from "../lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { syncSalesDocumentToZoho } from "../lib/salesDocument/syncSalesDocumentToZoho";
import {
  createZohoInvoice,
  getZohoInvoice,
  markZohoInvoicePaid,
} from "../lib/zoho/zohoBooksService";
import {
  resolveZohoCustomerContactForBooking,
  resolveZohoCustomerContactForMonthlyInvoice,
} from "../lib/zoho/resolveZohoCustomerContact";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

const BOOKING_IDS = [
  "1e2f0c30-5cba-4e0b-8fec-f744c6cb471d",
  "a2a7fa62-04aa-42dc-a557-a1da8843641b",
  "d5efd3a4-3e1c-487a-b16a-3ed484ea0787",
  "eceab240-6032-452d-9d5b-c755261ffc24",
  "8508b9dc-cd91-4aaa-bc13-daab069c6c2a",
  "2b3d5f7b-bed5-4d0f-b865-6fc163db831a",
  "8b59fe07-0a22-4ba0-8239-92607b96db90",
  "d860554e-c132-477b-bf15-557fb9c88a5e",
] as const;

const SALES_DOCUMENT_ID = "f8e6fbfd-6495-454d-ac9b-20c82643f4db";
const MONTHLY_INVOICE_ID = "81acdbc8-ddf4-4fc3-add4-0daf408740ca";

const EXPECTED_BOOKING_AMOUNTS_CENTS: Record<(typeof BOOKING_IDS)[number], number> = {
  "1e2f0c30-5cba-4e0b-8fec-f744c6cb471d": 200600,
  "a2a7fa62-04aa-42dc-a557-a1da8843641b": 29300,
  "d5efd3a4-3e1c-487a-b16a-3ed484ea0787": 39000,
  "eceab240-6032-452d-9d5b-c755261ffc24": 42900,
  "8508b9dc-cd91-4aaa-bc13-daab069c6c2a": 58000,
  "2b3d5f7b-bed5-4d0f-b865-6fc163db831a": 40000,
  "8b59fe07-0a22-4ba0-8239-92607b96db90": 46700,
  "d860554e-c132-477b-bf15-557fb9c88a5e": 242000,
};

const EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS = 32000;
const EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS = 155200;

type PaymentTx = {
  id: string;
  entity_type: string;
  entity_id: string;
  amount_cents: number;
  gateway_reference: string | null;
  paid_at: string | null;
  external_accounting_id: string | null;
  sync_status: string | null;
};

function fail(message: string): never {
  throw new Error(`INV-E2E-01D safety stop: ${message}`);
}

function ymdJhb(value: string | null | undefined): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) fail(`invalid date: ${String(value)}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

async function loadSinglePaymentTx(
  admin: SupabaseClient,
  entityType: "booking" | "monthly_invoice" | "sales_document",
  entityId: string,
): Promise<PaymentTx> {
  const { data, error } = await admin
    .from("payment_transactions")
    .select(
      "id, entity_type, entity_id, amount_cents, gateway_reference, paid_at, external_accounting_id, sync_status",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error) fail(`payment transaction lookup failed for ${entityType} ${entityId}: ${error.message}`);
  if (!data || data.length !== 1) {
    fail(`expected exactly one payment transaction for ${entityType} ${entityId}; found ${data?.length ?? 0}`);
  }
  return data[0] as PaymentTx;
}

async function loadQueueRecordId(admin: SupabaseClient, paymentTransactionId: string): Promise<string> {
  const { data, error } = await admin
    .from("accounting_sync_records")
    .select("id, sync_status")
    .eq("entity_type", "payment_transaction")
    .eq("entity_id", paymentTransactionId);

  if (error) fail(`queue lookup failed for payment transaction ${paymentTransactionId}: ${error.message}`);
  if (!data || data.length !== 1) {
    fail(`expected exactly one queue record for payment transaction ${paymentTransactionId}; found ${data?.length ?? 0}`);
  }
  return String(data[0].id);
}

async function verifyPaidInvoice(params: {
  zohoInvoiceId: string;
  expectedTotalCents: number;
  label: string;
}) {
  const details = await getZohoInvoice(params.zohoInvoiceId);
  if (!details.ok) fail(`${params.label}: Zoho invoice read failed: ${details.error}`);
  if (details.totalCents !== params.expectedTotalCents) {
    fail(
      `${params.label}: Zoho total mismatch expected=${params.expectedTotalCents} actual=${details.totalCents}`,
    );
  }
  if (String(details.status).toLowerCase() !== "paid" || details.balanceCents !== 0) {
    fail(
      `${params.label}: Zoho invoice not authoritatively paid/zero status=${details.status} balance=${details.balanceCents}`,
    );
  }
  return details;
}

async function settleQueue(
  admin: SupabaseClient,
  paymentTx: PaymentTx,
  queueRecordId: string,
  paymentId: string,
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("payment_transactions")
    .update({
      external_accounting_id: paymentId,
      sync_status: "synced",
      last_synced_at: now,
      sync_errors: null,
    })
    .eq("id", paymentTx.id);

  if (error) fail(`payment transaction update failed ${paymentTx.id}: ${error.message}`);
  await markSyncSucceeded(admin, queueRecordId, paymentId);
}

async function repairBooking(admin: SupabaseClient, bookingId: (typeof BOOKING_IDS)[number]) {
  const expectedAmount = EXPECTED_BOOKING_AMOUNTS_CENTS[bookingId];
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, customer_id, user_id, customer_email, customer_name, customer_phone, booking_snapshot, service, date, location, suburb, total_paid_zar, amount_paid_cents, payment_completed_at, payment_status, is_monthly_billing_booking, sales_document_id, payment_method, is_test, zoho_invoice_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) fail(`booking ${bookingId}: load failed: ${error.message}`);
  if (!data) fail(`booking ${bookingId}: not found`);
  const row = data as Record<string, unknown>;

  if (row.zoho_invoice_id) fail(`booking ${bookingId}: already linked to Zoho`);
  if (row.is_test === true) fail(`booking ${bookingId}: test booking`);
  if (row.is_monthly_billing_booking === true) fail(`booking ${bookingId}: monthly billing booking`);
  if (String(row.sales_document_id ?? "").trim()) fail(`booking ${bookingId}: sales-document-owned`);
  if (String(row.payment_method ?? "").toLowerCase() === "zoho") fail(`booking ${bookingId}: payment_method=zoho`);
  if (!row.payment_completed_at) fail(`booking ${bookingId}: payment_completed_at missing`);

  const tx = await loadSinglePaymentTx(admin, "booking", bookingId);
  if (Number(tx.amount_cents) !== expectedAmount) {
    fail(`booking ${bookingId}: payment amount mismatch expected=${expectedAmount} actual=${tx.amount_cents}`);
  }
  const queueId = await loadQueueRecordId(admin, tx.id);

  const totalPaidCents = Math.round(
    Number(row.amount_paid_cents ?? 0) > 0
      ? Number(row.amount_paid_cents)
      : Number(row.total_paid_zar ?? 0) * 100,
  );
  if (totalPaidCents !== expectedAmount) {
    fail(`booking ${bookingId}: booking paid amount mismatch expected=${expectedAmount} actual=${totalPaidCents}`);
  }

  const label = `booking ${bookingId.slice(0, 8)}`;
  const existingZohoId = String(row.zoho_invoice_id ?? "").trim();

  if (existingZohoId) {
    if (!apply) {
      console.log(`[dry-run] ${label} already linked -> verify/skip on apply (${existingZohoId})`);
      return;
    }

    const details = await verifyPaidInvoice({
      zohoInvoiceId: existingZohoId,
      expectedTotalCents: expectedAmount,
      label,
    });
    await upsertInvoiceSyncMetadata(admin, {
      entityType: "booking",
      entityId: bookingId,
      bookingId,
      zohoInvoiceId: existingZohoId,
      zohoInvoiceNumber: details.invoiceNumber,
      zohoCustomerId: details.customerId,
      invoiceStatus: details.status,
      invoiceTotalCents: details.totalCents,
      taxAmountCents: details.taxCents,
      outstandingBalanceCents: details.balanceCents,
    });

    if (tx.sync_status === "synced" && tx.external_accounting_id) {
      await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
      console.log(`[resume] ${label} already complete; verified and skipped`);
      return;
    }

    fail(`${label}: invoice already paid+linked but payment accounting id is missing; leave for explicit reconciliation`);
  }

  if (!apply) {
    console.log(
      `[dry-run] ${label} create+pay R${(expectedAmount / 100).toFixed(2)} ref=${tx.gateway_reference ?? "(none)"}`,
    );
    return;
  }

  const contactRes = await resolveZohoCustomerContactForBooking(admin, row);
  if (!contactRes.ok) fail(`${label}: contact resolution failed: ${contactRes.error}`);
  const contact = contactRes.contact;

  const locationLabel = [row.location, row.suburb].filter(Boolean).join(", ");
  const paymentDate = ymdJhb(tx.paid_at ?? String(row.payment_completed_at));

  const created = await createZohoInvoice({
    referenceId: bookingId,
    orderKind: "booking",
    customerEmail: contact.email,
    customerName: contact.name,
    customerPhone: contact.phone,
    invoiceDate: paymentDate,
    dueDate: paymentDate,
    lineItems: [
      {
        name: String(row.service ?? "Shalean Cleaning Service"),
        description:
          [row.date, locationLabel].filter(Boolean).join(" · ") ||
          `Booking ${bookingId.slice(0, 8)}`,
        rate: expectedAmount / 100,
        quantity: 1,
      },
    ],
    notes: `INV-E2E-01D targeted repair. Paystack ref: ${tx.gateway_reference ?? bookingId}`,
    currencyCode: "ZAR",
  });
  if (!created.ok) fail(`${label}: create failed: ${created.error}`);

  const paid = await markZohoInvoicePaid({
    zohoInvoiceId: created.zohoInvoiceId,
    amountZar: expectedAmount / 100,
    paymentDate,
    reference: tx.gateway_reference ?? bookingId,
    customerEmail: contact.email,
    customerName: contact.name,
  });
  if (!paid.ok) fail(`${label}: mark paid failed: ${paid.error}`);

  const details = await verifyPaidInvoice({
    zohoInvoiceId: created.zohoInvoiceId,
    expectedTotalCents: expectedAmount,
    label,
  });

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      zoho_invoice_id: created.zohoInvoiceId,
      zoho_invoice_number: created.invoiceNumber,
    })
    .eq("id", bookingId)
    .is("zoho_invoice_id", null);
  if (upErr) fail(`${label}: DB link failed: ${upErr.message}`);

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "booking",
    entityId: bookingId,
    bookingId,
    zohoInvoiceId: created.zohoInvoiceId,
    zohoInvoiceNumber: created.invoiceNumber,
    zohoCustomerId: details.customerId,
    invoiceStatus: details.status,
    invoiceTotalCents: details.totalCents,
    taxAmountCents: details.taxCents,
    outstandingBalanceCents: details.balanceCents,
  });
  await settleQueue(admin, tx, queueId, paid.paymentId);
  console.log(`[applied] ${label} -> ${created.invoiceNumber} paid+linked`);
}

async function repairMonthlyInvoice(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, due_date, invoice_date, status, total_amount_cents, amount_paid_cents, paystack_reference, zoho_invoice_id",
    )
    .eq("id", MONTHLY_INVOICE_ID)
    .maybeSingle();

  if (error) fail(`monthly invoice: load failed: ${error.message}`);
  if (!data) fail("monthly invoice: not found");
  if (data.zoho_invoice_id) fail("monthly invoice: already linked");
  if (String(data.status).toLowerCase() !== "paid") fail(`monthly invoice: expected paid, got ${data.status}`);
  if (Number(data.total_amount_cents) !== EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS) {
    fail("monthly invoice: total mismatch");
  }
  if (Number(data.amount_paid_cents) !== EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS) {
    fail("monthly invoice: paid amount mismatch");
  }

  const tx = await loadSinglePaymentTx(admin, "monthly_invoice", MONTHLY_INVOICE_ID);
  if (Number(tx.amount_cents) !== EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS) {
    fail("monthly invoice: payment transaction amount mismatch");
  }
  const queueId = await loadQueueRecordId(admin, tx.id);

  if (!apply) {
    console.log(
      `[dry-run] monthly ${MONTHLY_INVOICE_ID.slice(0, 8)} create+pay R${(
        EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS / 100
      ).toFixed(2)}`,
    );
    return;
  }

  const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
    invoiceId: data.id,
    customerId: data.customer_id,
  });
  if (!contactRes.ok) fail(`monthly invoice: contact resolution failed: ${contactRes.error}`);
  const contact = contactRes.contact;

  const existingZohoId = String(data.zoho_invoice_id ?? "").trim();
  let synced:
    | { ok: true; zohoInvoiceId: string; zohoInvoiceNumber?: string }
    | { ok: false; error: string };

  if (existingZohoId) {
    synced = { ok: true, zohoInvoiceId: existingZohoId };
  } else {
    synced = await syncMonthlyInvoiceToZohoBooks(admin, {
      invoiceId: data.id,
      customerId: data.customer_id,
      month: data.month,
      dueDate: data.due_date,
      balanceZar: EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS / 100,
      status: data.status,
      invoiceDate: data.invoice_date ?? undefined,
    });
  }
  if (!synced.ok) fail(`monthly invoice: create failed: ${synced.error}`);

  const beforePayment = await getZohoInvoice(synced.zohoInvoiceId);
  if (!beforePayment.ok) fail(`monthly invoice: Zoho read failed: ${beforePayment.error}`);

  if (
    String(beforePayment.status).toLowerCase() === "paid" &&
    beforePayment.balanceCents === 0
  ) {
    if (tx.sync_status === "synced" && tx.external_accounting_id) {
      await upsertInvoiceSyncMetadata(admin, {
        entityType: "monthly_invoice",
        entityId: data.id,
        zohoInvoiceId: synced.zohoInvoiceId,
        zohoInvoiceNumber: synced.zohoInvoiceNumber ?? beforePayment.invoiceNumber,
        zohoCustomerId: beforePayment.customerId,
        invoiceStatus: beforePayment.status,
        invoiceTotalCents: beforePayment.totalCents,
        taxAmountCents: beforePayment.taxCents,
        outstandingBalanceCents: beforePayment.balanceCents,
      });
      await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
      console.log("[resume] monthly invoice already complete; verified and skipped");
      return;
    }
    fail("monthly invoice already paid+linked but payment accounting id is missing; leave for explicit reconciliation");
  }

  const paymentDate = ymdJhb(tx.paid_at);
  const paid = await markZohoInvoicePaid({
    zohoInvoiceId: synced.zohoInvoiceId,
    amountZar: EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS / 100,
    paymentDate,
    reference: tx.gateway_reference ?? data.paystack_reference ?? data.id,
    customerEmail: contact.email,
    customerName: contact.name,
  });
  if (!paid.ok) fail(`monthly invoice: mark paid failed: ${paid.error}`);

  const details = await verifyPaidInvoice({
    zohoInvoiceId: synced.zohoInvoiceId,
    expectedTotalCents: EXPECTED_MONTHLY_INVOICE_AMOUNT_CENTS,
    label: "monthly invoice",
  });

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "monthly_invoice",
    entityId: data.id,
    zohoInvoiceId: synced.zohoInvoiceId,
    zohoInvoiceNumber: synced.zohoInvoiceNumber ?? details.invoiceNumber,
    zohoCustomerId: details.customerId,
    invoiceStatus: details.status,
    invoiceTotalCents: details.totalCents,
    taxAmountCents: details.taxCents,
    outstandingBalanceCents: details.balanceCents,
  });
  await settleQueue(admin, tx, queueId, paid.paymentId);
  console.log(`[applied] monthly ${data.id.slice(0, 8)} -> ${details.invoiceNumber} paid+linked`);
}

async function repairSalesDocument(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, total_cents, amount_paid_cents, zoho_invoice_id")
    .eq("id", SALES_DOCUMENT_ID)
    .maybeSingle();

  if (error) fail(`sales document: load failed: ${error.message}`);
  if (!data) fail("sales document: not found");
  if (data.zoho_invoice_id) fail("sales document: already linked");
  if (data.document_type !== "invoice") fail(`sales document: expected invoice, got ${data.document_type}`);
  if (String(data.status).toLowerCase() !== "paid") fail(`sales document: expected paid, got ${data.status}`);
  if (Number(data.total_cents) !== EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS) fail("sales document: total mismatch");
  if (Number(data.amount_paid_cents) !== EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS) fail("sales document: paid amount mismatch");

  const tx = await loadSinglePaymentTx(admin, "sales_document", SALES_DOCUMENT_ID);
  if (Number(tx.amount_cents) !== EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS) {
    fail("sales document: payment transaction amount mismatch");
  }
  const queueId = await loadQueueRecordId(admin, tx.id);

  if (!apply) {
    console.log(
      `[dry-run] sales document ${SALES_DOCUMENT_ID.slice(0, 8)} create+pay R${(
        EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS / 100
      ).toFixed(2)}`,
    );
    return;
  }

  const existingZohoId = String(data.zoho_invoice_id ?? "").trim();
  if (!existingZohoId) {
    const synced = await syncSalesDocumentToZoho(admin, SALES_DOCUMENT_ID);
    if (!synced.ok) fail(`sales document: create failed: ${synced.error}`);
  }

  const { data: fresh, error: freshErr } = await admin
    .from("sales_documents")
    .select("zoho_invoice_id, zoho_invoice_number, customer_email, customer_name")
    .eq("id", SALES_DOCUMENT_ID)
    .maybeSingle();
  if (freshErr || !fresh?.zoho_invoice_id) fail("sales document: link missing after create");

  const beforePayment = await getZohoInvoice(fresh.zoho_invoice_id);
  if (!beforePayment.ok) fail(`sales document: Zoho read failed: ${beforePayment.error}`);
  if (
    String(beforePayment.status).toLowerCase() === "paid" &&
    beforePayment.balanceCents === 0
  ) {
    if (tx.sync_status === "synced" && tx.external_accounting_id) {
      await upsertInvoiceSyncMetadata(admin, {
        entityType: "sales_document",
        entityId: SALES_DOCUMENT_ID,
        zohoInvoiceId: fresh.zoho_invoice_id,
        zohoInvoiceNumber: fresh.zoho_invoice_number ?? beforePayment.invoiceNumber,
        zohoCustomerId: beforePayment.customerId,
        invoiceStatus: beforePayment.status,
        invoiceTotalCents: beforePayment.totalCents,
        taxAmountCents: beforePayment.taxCents,
        outstandingBalanceCents: beforePayment.balanceCents,
      });
      await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
      console.log("[resume] sales document already complete; verified and skipped");
      return;
    }
    fail("sales document already paid+linked but payment accounting id is missing; leave for explicit reconciliation");
  }

  const paymentDate = ymdJhb(tx.paid_at);
  const paid = await markZohoInvoicePaid({
    zohoInvoiceId: fresh.zoho_invoice_id,
    amountZar: EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS / 100,
    paymentDate,
    reference: tx.gateway_reference ?? SALES_DOCUMENT_ID,
    customerEmail: fresh.customer_email ?? undefined,
    customerName: fresh.customer_name ?? undefined,
  });
  if (!paid.ok) fail(`sales document: mark paid failed: ${paid.error}`);

  const details = await verifyPaidInvoice({
    zohoInvoiceId: fresh.zoho_invoice_id,
    expectedTotalCents: EXPECTED_SALES_DOCUMENT_AMOUNT_CENTS,
    label: "sales document",
  });

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "sales_document",
    entityId: SALES_DOCUMENT_ID,
    zohoInvoiceId: fresh.zoho_invoice_id,
    zohoInvoiceNumber: fresh.zoho_invoice_number ?? details.invoiceNumber,
    zohoCustomerId: details.customerId,
    invoiceStatus: details.status,
    invoiceTotalCents: details.totalCents,
    taxAmountCents: details.taxCents,
    outstandingBalanceCents: details.balanceCents,
  });
  await settleQueue(admin, tx, queueId, paid.paymentId);
  console.log(`[applied] sales document ${SALES_DOCUMENT_ID.slice(0, 8)} -> ${details.invoiceNumber} paid+linked`);
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) fail("Supabase server credentials missing");
  if (
    !process.env.ZOHO_CLIENT_ID ||
    !process.env.ZOHO_CLIENT_SECRET ||
    !process.env.ZOHO_REFRESH_TOKEN ||
    !process.env.ZOHO_ORGANIZATION_ID
  ) {
    fail("Zoho credentials missing");
  }

  if (process.env.ZOHO_ORGANIZATION_ID !== "927500285") {
    fail(`wrong Zoho organization: expected 927500285, got ${process.env.ZOHO_ORGANIZATION_ID}`);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { count: cronCount, error: cronErr } = await admin
    .schema("cron")
    .from("job")
    .select("jobid", { count: "exact", head: true })
    .eq("jobname", "accounting-sync");
  if (cronErr) {
    console.warn("Could not verify cron pause through Supabase client; confirm accounting-sync remains unscheduled before --apply.");
  } else if ((cronCount ?? 0) !== 0) {
    fail("accounting-sync cron is still scheduled; pause it before repair");
  }

  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");
  console.log("Allowlist: 8 bookings + 1 monthly invoice + 1 sales document");

  const failures: string[] = [];

  for (const id of BOOKING_IDS) {
    try {
      await repairBooking(admin, id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`booking ${id.slice(0, 8)}: ${message}`);
      console.error(`[item-failed] booking ${id.slice(0, 8)}: ${message}`);
    }
  }

  for (const [label, fn] of [
    ["monthly invoice", () => repairMonthlyInvoice(admin)],
    ["sales document", () => repairSalesDocument(admin)],
  ] as const) {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${label}: ${message}`);
      console.error(`[item-failed] ${label}: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`INV-E2E-01D completed with ${failures.length} item failure(s):`);
    for (const message of failures) console.error(`- ${message}`);
    process.exitCode = 1;
  } else {
    console.log(apply ? "INV-E2E-01D targeted repair complete." : "Dry-run complete. No writes performed.");
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
