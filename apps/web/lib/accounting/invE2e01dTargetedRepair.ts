import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { markSyncSucceeded } from "@/lib/accounting/accountingSyncQueue";
import { upsertInvoiceSyncMetadata } from "@/lib/accounting/syncInvoiceMetadata";
import { syncMonthlyInvoiceToZohoBooks } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { salesDocumentLineItemsToZoho, type SalesDocumentLineItem } from "@/lib/salesDocument/types";
import {
  createZohoInvoice,
  getZohoInvoice,
  markZohoInvoicePaid,
} from "@/lib/zoho/zohoBooksService";
import {
  resolveZohoCustomerContactForBooking,
  resolveZohoCustomerContactForMonthlyInvoice,
} from "@/lib/zoho/resolveZohoCustomerContact";

export const INV_E2E_01D_BOOKING_TARGETS = [
  ["1e2f0c30-5cba-4e0b-8fec-f744c6cb471d", 200600],
  ["a2a7fa62-04aa-42dc-a557-a1da8843641b", 29300],
  ["d5efd3a4-3e1c-487a-b16a-3ed484ea0787", 39000],
  ["eceab240-6032-452d-9d5b-c755261ffc24", 42900],
  ["8508b9dc-cd91-4aaa-bc13-daab069c6c2a", 58000],
  ["2b3d5f7b-bed5-4d0f-b865-6fc163db831a", 40000],
  ["8b59fe07-0a22-4ba0-8239-92607b96db90", 46700],
  ["d860554e-c132-477b-bf15-557fb9c88a5e", 242000],
] as const;

export const INV_E2E_01D_MONTHLY_INVOICE_ID = "81acdbc8-ddf4-4fc3-add4-0daf408740ca";
export const INV_E2E_01D_MONTHLY_AMOUNT_CENTS = 155200;
export const INV_E2E_01D_SALES_DOCUMENT_ID = "f8e6fbfd-6495-454d-ac9b-20c82643f4db";
export const INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS = 32000;

type PaymentTx = {
  id: string;
  amount_cents: number;
  gateway_reference: string | null;
  paid_at: string | null;
  external_accounting_id: string | null;
  sync_status: string | null;
};

export type InvE2eRepairItemResult = {
  kind: "booking" | "monthly_invoice" | "sales_document";
  id: string;
  ok: boolean;
  outcome: "created_paid_linked" | "resumed_paid_linked" | "already_complete" | "failed";
  invoice_number?: string | null;
  error?: string;
};

export function zohoSafePaymentReference(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? "").trim() || fallback;
  return raw.slice(0, 50);
}

function ymdJhb(value: string | null | undefined): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${String(value)}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function loadSinglePaymentTx(
  admin: SupabaseClient,
  entityType: "booking" | "monthly_invoice" | "sales_document",
  entityId: string,
): Promise<PaymentTx> {
  const { data, error } = await admin
    .from("payment_transactions")
    .select("id, amount_cents, gateway_reference, paid_at, external_accounting_id, sync_status")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error) throw new Error(`payment lookup failed: ${error.message}`);
  if (!data || data.length !== 1) {
    throw new Error(`expected one payment transaction, found ${data?.length ?? 0}`);
  }
  return data[0] as PaymentTx;
}

async function loadQueueRecordId(admin: SupabaseClient, paymentTransactionId: string): Promise<string> {
  const { data, error } = await admin
    .from("accounting_sync_records")
    .select("id")
    .eq("entity_type", "payment_transaction")
    .eq("entity_id", paymentTransactionId);

  if (error) throw new Error(`queue lookup failed: ${error.message}`);
  if (!data || data.length !== 1) {
    throw new Error(`expected one queue record, found ${data?.length ?? 0}`);
  }
  return String(data[0].id);
}

async function settleQueue(
  admin: SupabaseClient,
  tx: PaymentTx,
  queueId: string,
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
    .eq("id", tx.id);

  if (error) throw new Error(`payment transaction update failed: ${error.message}`);
  await markSyncSucceeded(admin, queueId, paymentId);
}

async function readAndValidateInvoice(
  zohoInvoiceId: string,
  expectedTotalCents: number,
  requirePaid: boolean,
) {
  const details = await getZohoInvoice(zohoInvoiceId);
  if (!details.ok) throw new Error(`Zoho invoice read failed: ${details.error}`);
  if (details.totalCents !== expectedTotalCents) {
    throw new Error(`Zoho total mismatch expected=${expectedTotalCents} actual=${details.totalCents}`);
  }
  if (requirePaid && (String(details.status).toLowerCase() !== "paid" || details.balanceCents !== 0)) {
    throw new Error(`Zoho invoice not paid/zero: status=${details.status} balance=${details.balanceCents}`);
  }
  return details;
}

async function repairBooking(
  admin: SupabaseClient,
  bookingId: string,
  expectedAmountCents: number,
): Promise<InvE2eRepairItemResult> {
  try {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, customer_id, customer_email, customer_name, customer_phone, booking_snapshot, service, date, location, suburb, total_paid_zar, amount_paid_cents, payment_completed_at, is_monthly_billing_booking, sales_document_id, payment_method, is_test, zoho_invoice_id, zoho_invoice_number",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("booking_not_found");
    if (data.is_test === true) throw new Error("is_test");
    if (data.is_monthly_billing_booking === true) throw new Error("monthly_billing_booking");
    if (String(data.sales_document_id ?? "").trim()) throw new Error("sales_document_owned");
    if (String(data.payment_method ?? "").toLowerCase() === "zoho") throw new Error("payment_method_zoho");
    if (!data.payment_completed_at) throw new Error("payment_completed_at_missing");

    const localAmount = Number(data.amount_paid_cents ?? 0) > 0
      ? Number(data.amount_paid_cents)
      : Math.round(Number(data.total_paid_zar ?? 0) * 100);
    if (localAmount !== expectedAmountCents) throw new Error(`booking_amount_mismatch:${localAmount}`);

    const tx = await loadSinglePaymentTx(admin, "booking", bookingId);
    if (Number(tx.amount_cents) !== expectedAmountCents) {
      throw new Error(`payment_amount_mismatch:${tx.amount_cents}`);
    }
    const queueId = await loadQueueRecordId(admin, tx.id);
    const contactRes = await resolveZohoCustomerContactForBooking(admin, data);
    if (!contactRes.ok) throw new Error(`contact_resolution:${contactRes.error}`);
    const contact = contactRes.contact;
    const paymentDate = ymdJhb(tx.paid_at ?? data.payment_completed_at);
    const linked = String(data.zoho_invoice_id ?? "").trim();

    if (linked) {
      const current = await readAndValidateInvoice(linked, expectedAmountCents, false);
      if (String(current.status).toLowerCase() === "paid" && current.balanceCents === 0) {
        if (!tx.external_accounting_id || tx.sync_status !== "synced") {
          throw new Error("invoice_already_paid_but_payment_accounting_id_missing");
        }
        await upsertInvoiceSyncMetadata(admin, {
          entityType: "booking",
          entityId: bookingId,
          bookingId,
          zohoInvoiceId: linked,
          zohoInvoiceNumber: current.invoiceNumber,
          zohoCustomerId: current.customerId,
          invoiceStatus: current.status,
          invoiceTotalCents: current.totalCents,
          taxAmountCents: current.taxCents,
          outstandingBalanceCents: current.balanceCents,
        });
        await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
        return { kind: "booking", id: bookingId, ok: true, outcome: "already_complete", invoice_number: current.invoiceNumber };
      }
      if (current.balanceCents !== expectedAmountCents) {
        throw new Error(`unexpected_existing_balance:${current.balanceCents}`);
      }

      const paid = await markZohoInvoicePaid({
        zohoInvoiceId: linked,
        amountZar: expectedAmountCents / 100,
        paymentDate,
        reference: zohoSafePaymentReference(tx.gateway_reference, bookingId),
        customerEmail: contact.email,
        customerName: contact.name,
      });
      if (!paid.ok) throw new Error(`mark_paid_failed:${paid.error}`);
      const details = await readAndValidateInvoice(linked, expectedAmountCents, true);
      await upsertInvoiceSyncMetadata(admin, {
        entityType: "booking",
        entityId: bookingId,
        bookingId,
        zohoInvoiceId: linked,
        zohoInvoiceNumber: details.invoiceNumber,
        zohoCustomerId: details.customerId,
        invoiceStatus: details.status,
        invoiceTotalCents: details.totalCents,
        taxAmountCents: details.taxCents,
        outstandingBalanceCents: details.balanceCents,
      });
      await settleQueue(admin, tx, queueId, paid.paymentId);
      return { kind: "booking", id: bookingId, ok: true, outcome: "resumed_paid_linked", invoice_number: details.invoiceNumber };
    }

    const locationLabel = [data.location, data.suburb].filter(Boolean).join(", ");
    const created = await createZohoInvoice({
      referenceId: bookingId,
      orderKind: "booking",
      customerEmail: contact.email,
      customerName: contact.name,
      customerPhone: contact.phone,
      invoiceDate: paymentDate,
      dueDate: paymentDate,
      lineItems: [{
        name: String(data.service ?? "Shalean Cleaning Service"),
        description: [data.date, locationLabel].filter(Boolean).join(" · ") || `Booking ${bookingId.slice(0, 8)}`,
        rate: expectedAmountCents / 100,
        quantity: 1,
      }],
      notes: `INV-E2E-01D targeted repair. Paystack ref: ${tx.gateway_reference ?? bookingId}`,
      currencyCode: "ZAR",
    });
    if (!created.ok) throw new Error(`create_failed:${created.error}`);

    const paid = await markZohoInvoicePaid({
      zohoInvoiceId: created.zohoInvoiceId,
      amountZar: expectedAmountCents / 100,
      paymentDate,
      reference: zohoSafePaymentReference(tx.gateway_reference, bookingId),
      customerEmail: contact.email,
      customerName: contact.name,
    });
    if (!paid.ok) throw new Error(`mark_paid_failed:${paid.error}`);

    const details = await readAndValidateInvoice(created.zohoInvoiceId, expectedAmountCents, true);
    const { error: linkError } = await admin
      .from("bookings")
      .update({ zoho_invoice_id: created.zohoInvoiceId, zoho_invoice_number: created.invoiceNumber })
      .eq("id", bookingId)
      .is("zoho_invoice_id", null);
    if (linkError) throw new Error(`link_failed:${linkError.message}`);

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
    return { kind: "booking", id: bookingId, ok: true, outcome: "created_paid_linked", invoice_number: created.invoiceNumber };
  } catch (err) {
    return { kind: "booking", id: bookingId, ok: false, outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

async function repairMonthly(admin: SupabaseClient): Promise<InvE2eRepairItemResult> {
  const id = INV_E2E_01D_MONTHLY_INVOICE_ID;
  try {
    const { data, error } = await admin
      .from("monthly_invoices")
      .select("id, customer_id, month, due_date, invoice_date, status, total_amount_cents, amount_paid_cents, paystack_reference, zoho_invoice_id, zoho_invoice_number")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("monthly_invoice_not_found");
    if (String(data.status).toLowerCase() !== "paid") throw new Error(`status:${data.status}`);
    if (Number(data.total_amount_cents) !== INV_E2E_01D_MONTHLY_AMOUNT_CENTS) throw new Error("total_mismatch");
    if (Number(data.amount_paid_cents) !== INV_E2E_01D_MONTHLY_AMOUNT_CENTS) throw new Error("paid_amount_mismatch");

    const tx = await loadSinglePaymentTx(admin, "monthly_invoice", id);
    if (Number(tx.amount_cents) !== INV_E2E_01D_MONTHLY_AMOUNT_CENTS) throw new Error("payment_amount_mismatch");
    const queueId = await loadQueueRecordId(admin, tx.id);
    const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, { invoiceId: id, customerId: data.customer_id });
    if (!contactRes.ok) throw new Error(`contact_resolution:${contactRes.error}`);
    const contact = contactRes.contact;

    let zohoId = String(data.zoho_invoice_id ?? "").trim();
    let invoiceNumber = String(data.zoho_invoice_number ?? "").trim() || null;
    if (!zohoId) {
      const synced = await syncMonthlyInvoiceToZohoBooks(admin, {
        invoiceId: data.id,
        customerId: data.customer_id,
        month: data.month,
        dueDate: data.due_date,
        balanceZar: INV_E2E_01D_MONTHLY_AMOUNT_CENTS / 100,
        status: data.status,
        invoiceDate: data.invoice_date ?? undefined,
      });
      if (!synced.ok) throw new Error(`create_failed:${synced.error}`);
      zohoId = synced.zohoInvoiceId;
      invoiceNumber = synced.zohoInvoiceNumber ?? null;
    }

    const current = await readAndValidateInvoice(zohoId, INV_E2E_01D_MONTHLY_AMOUNT_CENTS, false);
    if (String(current.status).toLowerCase() === "paid" && current.balanceCents === 0) {
      if (!tx.external_accounting_id || tx.sync_status !== "synced") throw new Error("invoice_already_paid_but_payment_accounting_id_missing");
      await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
      return { kind: "monthly_invoice", id, ok: true, outcome: "already_complete", invoice_number: invoiceNumber ?? current.invoiceNumber };
    }
    if (current.balanceCents !== INV_E2E_01D_MONTHLY_AMOUNT_CENTS) throw new Error(`unexpected_existing_balance:${current.balanceCents}`);

    const paid = await markZohoInvoicePaid({
      zohoInvoiceId: zohoId,
      amountZar: INV_E2E_01D_MONTHLY_AMOUNT_CENTS / 100,
      paymentDate: ymdJhb(tx.paid_at),
      reference: zohoSafePaymentReference(tx.gateway_reference ?? data.paystack_reference, id),
      customerEmail: contact.email,
      customerName: contact.name,
    });
    if (!paid.ok) throw new Error(`mark_paid_failed:${paid.error}`);
    const details = await readAndValidateInvoice(zohoId, INV_E2E_01D_MONTHLY_AMOUNT_CENTS, true);
    await upsertInvoiceSyncMetadata(admin, {
      entityType: "monthly_invoice",
      entityId: id,
      zohoInvoiceId: zohoId,
      zohoInvoiceNumber: invoiceNumber ?? details.invoiceNumber,
      zohoCustomerId: details.customerId,
      invoiceStatus: details.status,
      invoiceTotalCents: details.totalCents,
      taxAmountCents: details.taxCents,
      outstandingBalanceCents: details.balanceCents,
    });
    await settleQueue(admin, tx, queueId, paid.paymentId);
    return { kind: "monthly_invoice", id, ok: true, outcome: data.zoho_invoice_id ? "resumed_paid_linked" : "created_paid_linked", invoice_number: invoiceNumber ?? details.invoiceNumber };
  } catch (err) {
    return { kind: "monthly_invoice", id, ok: false, outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

async function repairSalesDocument(admin: SupabaseClient): Promise<InvE2eRepairItemResult> {
  const id = INV_E2E_01D_SALES_DOCUMENT_ID;
  try {
    const { data, error } = await admin
      .from("sales_documents")
      .select("id, document_type, status, total_cents, amount_paid_cents, customer_email, customer_name, customer_phone, line_items, currency, due_date, notes, created_at, zoho_invoice_id, zoho_invoice_number")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("sales_document_not_found");
    if (data.document_type !== "invoice") throw new Error(`document_type:${data.document_type}`);
    if (String(data.status).toLowerCase() !== "paid") throw new Error(`status:${data.status}`);
    if (Number(data.total_cents) !== INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS) throw new Error("total_mismatch");
    if (Number(data.amount_paid_cents) !== INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS) throw new Error("paid_amount_mismatch");

    const tx = await loadSinglePaymentTx(admin, "sales_document", id);
    if (Number(tx.amount_cents) !== INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS) throw new Error("payment_amount_mismatch");
    const queueId = await loadQueueRecordId(admin, tx.id);

    let zohoId = String(data.zoho_invoice_id ?? "").trim();
    let invoiceNumber = String(data.zoho_invoice_number ?? "").trim() || null;
    if (!zohoId) {
      const lineItems = Array.isArray(data.line_items)
        ? salesDocumentLineItemsToZoho(data.line_items as SalesDocumentLineItem[])
        : [];
      if (lineItems.length === 0) throw new Error("no_line_items");

      const invoiceDate = ymdJhb(data.created_at ?? tx.paid_at);
      const storedDueDate = String(data.due_date ?? "").slice(0, 10);
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(storedDueDate) && storedDueDate >= invoiceDate
        ? storedDueDate
        : invoiceDate;

      const created = await createZohoInvoice({
        referenceId: id,
        orderKind: "sales",
        customerEmail: data.customer_email ?? undefined,
        customerName: data.customer_name ?? undefined,
        customerPhone: data.customer_phone ?? undefined,
        lineItems,
        invoiceDate,
        dueDate,
        notes: [data.notes, `INV-E2E-01H targeted historical repair for ${id}`].filter(Boolean).join("\n"),
        currencyCode: String(data.currency ?? "ZAR"),
      });
      if (!created.ok) throw new Error(`create_failed:${created.error}`);

      const { error: linkError } = await admin
        .from("sales_documents")
        .update({
          zoho_invoice_id: created.zohoInvoiceId,
          zoho_invoice_number: created.invoiceNumber,
        })
        .eq("id", id)
        .is("zoho_invoice_id", null);
      if (linkError) throw new Error(`link_failed:${linkError.message}`);

      zohoId = created.zohoInvoiceId;
      invoiceNumber = created.invoiceNumber ?? null;
    }

    const current = await readAndValidateInvoice(zohoId, INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS, false);
    if (String(current.status).toLowerCase() === "paid" && current.balanceCents === 0) {
      if (!tx.external_accounting_id || tx.sync_status !== "synced") throw new Error("invoice_already_paid_but_payment_accounting_id_missing");
      await markSyncSucceeded(admin, queueId, tx.external_accounting_id);
      return { kind: "sales_document", id, ok: true, outcome: "already_complete", invoice_number: invoiceNumber ?? current.invoiceNumber };
    }
    if (current.balanceCents !== INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS) throw new Error(`unexpected_existing_balance:${current.balanceCents}`);

    const paid = await markZohoInvoicePaid({
      zohoInvoiceId: zohoId,
      amountZar: INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS / 100,
      paymentDate: ymdJhb(tx.paid_at),
      reference: zohoSafePaymentReference(tx.gateway_reference, id),
      customerEmail: data.customer_email ?? undefined,
      customerName: data.customer_name ?? undefined,
    });
    if (!paid.ok) throw new Error(`mark_paid_failed:${paid.error}`);
    const details = await readAndValidateInvoice(zohoId, INV_E2E_01D_SALES_DOCUMENT_AMOUNT_CENTS, true);
    await upsertInvoiceSyncMetadata(admin, {
      entityType: "sales_document",
      entityId: id,
      zohoInvoiceId: zohoId,
      zohoInvoiceNumber: invoiceNumber ?? details.invoiceNumber,
      zohoCustomerId: details.customerId,
      invoiceStatus: details.status,
      invoiceTotalCents: details.totalCents,
      taxAmountCents: details.taxCents,
      outstandingBalanceCents: details.balanceCents,
    });
    await settleQueue(admin, tx, queueId, paid.paymentId);
    return { kind: "sales_document", id, ok: true, outcome: data.zoho_invoice_id ? "resumed_paid_linked" : "created_paid_linked", invoice_number: invoiceNumber ?? details.invoiceNumber };
  } catch (err) {
    return { kind: "sales_document", id, ok: false, outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runInvE2e01dTargetedRepair(admin: SupabaseClient) {
  const results: InvE2eRepairItemResult[] = [];
  for (const [id, amount] of INV_E2E_01D_BOOKING_TARGETS) {
    results.push(await repairBooking(admin, id, amount));
  }
  results.push(await repairMonthly(admin));
  results.push(await repairSalesDocument(admin));
  return {
    ok: results.every((r) => r.ok),
    attempted: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
