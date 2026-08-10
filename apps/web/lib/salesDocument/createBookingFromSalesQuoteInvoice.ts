import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceLabel, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { insertBookingRowUnified } from "@/lib/booking/createBookingUnified";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";
import { resolveSalesDocumentBookingServiceSlug } from "@/lib/salesDocument/resolveSalesDocumentBookingServiceSlug";
import type {
  SalesDocumentLineItem,
  SalesDocumentQuoteRequestDetails,
  SalesDocumentQuoteRequestSelectedItem,
} from "@/lib/salesDocument/types";

const DEFAULT_TIME = "09:00";

function addDaysYmd(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveBookingDate(preferred: string | null | undefined, dueDate: string | null | undefined): string {
  const pref = String(preferred ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(pref)) return pref;
  const due = String(dueDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  return addDaysYmd(new Date(), 7);
}

function resolveExtraSlugs(items: SalesDocumentQuoteRequestSelectedItem[]): string[] {
  return items.filter((i) => i.kind === "extra").map((i) => i.slug.trim()).filter(Boolean);
}

function resolveLocation(
  requestDetails: SalesDocumentQuoteRequestDetails | null | undefined,
  notes: string | null | undefined,
): string {
  const suburb = String(requestDetails?.suburb ?? "").trim();
  if (suburb.length >= 3) return suburb.slice(0, 500);
  const noteLine = String(notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 3);
  if (noteLine) return noteLine.slice(0, 500);
  return "Address to be confirmed";
}

export type CreateBookingFromSalesQuoteInvoiceResult =
  | { ok: true; bookingId: string; alreadyExisted: boolean }
  | { ok: false; error: string };

/**
 * Creates (idempotently) a booking when a sales quote becomes an invoice.
 * Payment is collected on the sales document; the booking starts as `pending_payment`
 * until the invoice is marked paid.
 */
export async function createBookingFromSalesQuoteInvoice(
  admin: SupabaseClient,
  params: { quoteId: string; invoiceId: string },
): Promise<CreateBookingFromSalesQuoteInvoiceResult> {
  const { quoteId, invoiceId } = params;

  const { data: existingBooking, error: existingErr } = await admin
    .from("bookings")
    .select("id")
    .eq("sales_document_id", invoiceId)
    .maybeSingle();

  if (existingErr) return { ok: false, error: existingErr.message };
  if (existingBooking?.id) {
    return { ok: true, bookingId: String(existingBooking.id), alreadyExisted: true };
  }

  const ensuredCustomer = await ensureSalesDocumentCustomer(admin, quoteId);
  if (!ensuredCustomer.ok) return ensuredCustomer;

  const { error: invoiceCustomerErr } = await admin
    .from("sales_documents")
    .update({ customer_id: ensuredCustomer.customerId })
    .eq("id", invoiceId)
    .is("customer_id", null);

  if (invoiceCustomerErr) return { ok: false, error: invoiceCustomerErr.message };

  const { data: quote, error: quoteErr } = await admin
    .from("sales_documents")
    .select(
      "id, customer_id, customer_name, customer_email, customer_phone, request_details, notes, due_date, total_cents, line_items",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return { ok: false, error: quoteErr.message };
  if (!quote) return { ok: false, error: "quote_not_found" };

  const { data: invoice, error: invoiceErr } = await admin
    .from("sales_documents")
    .select("id, total_cents, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceErr) return { ok: false, error: invoiceErr.message };
  if (!invoice) return { ok: false, error: "invoice_not_found" };

  const q = quote as {
    customer_id: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    request_details?: SalesDocumentQuoteRequestDetails | null;
    line_items?: SalesDocumentLineItem[] | null;
    notes: string | null;
    due_date: string | null;
    total_cents: number;
  };

  const inv = invoice as { total_cents: number; status: string };
  const customerId = q.customer_id ?? ensuredCustomer.customerId;

  const requestDetails = q.request_details ?? null;
  const selectedItems = requestDetails?.selected_items ?? [];
  const lineItems = Array.isArray(q.line_items) ? q.line_items : [];
  const serviceSlug = resolveSalesDocumentBookingServiceSlug({ requestDetails, lineItems });
  const serviceId = parseBookingServiceId(serviceSlug) ?? "standard";
  const rooms = Math.min(20, Math.max(1, Math.round(Number(requestDetails?.bedrooms ?? 1))));
  const bathrooms = Math.min(20, Math.max(1, Math.round(Number(requestDetails?.bathrooms ?? 1))));
  const extras = resolveExtraSlugs(selectedItems);
  const location = resolveLocation(requestDetails, q.notes);
  const date = resolveBookingDate(requestDetails?.preferred_date, q.due_date);
  const totalCents = Math.max(0, Math.round(Number(inv.total_cents ?? q.total_cents ?? 0)));
  const totalPaidZar = Math.max(1, Math.round(totalCents / 100));
  const invoicePaid = String(inv.status ?? "").toLowerCase() === "paid";

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const paystackReference = `salesdoc_${invoiceId.replace(/-/g, "")}`;

  const ins = await insertBookingRowUnified(admin, {
    source: "sales_document_quote",
    rowBase: {
      paystack_reference: paystackReference,
      customer_email: q.customer_email.trim().toLowerCase(),
      customer_name: q.customer_name.trim(),
      customer_phone: q.customer_phone?.trim() || null,
      ...bookingCustomerOwnershipPatch(customerId, ownershipColumn),
      amount_paid_cents: invoicePaid ? totalCents : 0,
      currency: "ZAR",
      service_slug: serviceSlug,
      status: invoicePaid ? "pending" : "pending_payment",
      dispatch_status: "searching",
      surge_multiplier: 1,
      surge_reason: null,
      service: getServiceLabel(serviceId),
      location,
      location_id: null,
      city_id: null,
      date,
      time: DEFAULT_TIME,
      total_paid_zar: totalPaidZar,
      pricing_version_id: null,
      price_breakdown: null,
      total_price: null,
      booking_source: "sales_document",
      sales_document_id: invoiceId,
      ...(invoicePaid ? { payment_completed_at: new Date().toISOString(), payment_status: "success" } : {}),
    },
    rooms,
    bathrooms,
    extrasRaw: extras,
    serviceSlugForFlat: serviceSlug,
    locationForFlat: location,
    dateForFlat: date,
    timeForFlat: DEFAULT_TIME,
    snapshotExtension: {
      sales_document_id: invoiceId,
      sales_document_quote_id: quoteId,
      quote_request: requestDetails,
    },
    lineItemsPricing: {
      mode: "exact_source_lines",
      // The bookings table stores the canonical total in whole ZAR. Reconcile
      // source lines to that persisted value so cents on a sales document do
      // not fail unified booking validation.
      declaredTotalCents: totalPaidZar * 100,
      source: "sales_document",
      lines: lineItems.map((line) => ({
        name: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      })),
    },
  });

  if (!ins.ok) return ins;

  await logSystemEvent({
    level: "info",
    source: "sales_document/booking",
    message: "sales_document.booking_created",
    context: {
      quoteId,
      invoiceId,
      bookingId: ins.id,
      customerId,
      serviceSlug,
      date,
      status: invoicePaid ? "pending" : "pending_payment",
    },
  });

  return { ok: true, bookingId: ins.id, alreadyExisted: false };
}

/**
 * When a sales document invoice is paid, promote the linked booking out of `pending_payment`.
 */
export async function syncBookingPaymentFromSalesDocumentInvoice(
  admin: SupabaseClient,
  invoiceId: string,
  params: { amountCents: number; reference: string },
): Promise<void> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, status, amount_paid_cents")
    .eq("sales_document_id", invoiceId)
    .maybeSingle();

  if (error || !booking?.id) return;

  const row = booking as { id: string; status: string; amount_paid_cents?: number | null };
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "pending_payment" && st !== "pending") return;

  const amountCents = Math.max(0, Math.round(params.amountCents));
  const nowIso = new Date().toISOString();

  await admin
    .from("bookings")
    .update({
      status: "pending",
      dispatch_status: "searching",
      amount_paid_cents: amountCents,
      total_paid_zar: Math.max(1, Math.round(amountCents / 100)),
      payment_status: "success",
      payment_completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.id);

  await logSystemEvent({
    level: "info",
    source: "sales_document/booking",
    message: "sales_document.booking_payment_synced",
    context: { invoiceId, bookingId: row.id, amountCents, reference: params.reference },
  });
}
