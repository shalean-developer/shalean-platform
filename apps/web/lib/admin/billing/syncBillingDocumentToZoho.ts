import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminBillingDocumentKind } from "@/lib/admin/billing/loadAdminBillingDocuments";
import { syncPaidBookingSideEffects } from "@/lib/booking/syncPaidBookingSideEffects";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { syncMonthlyInvoiceToZohoBooks } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { resolveMonthlyInvoiceZohoTotalCents } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceZohoTotalCents";
import { resolveZohoCustomerContactForMonthlyInvoice } from "@/lib/zoho/resolveZohoCustomerContact";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import { syncSalesDocumentToZoho } from "@/lib/salesDocument/syncSalesDocumentToZoho";

export type SyncBillingDocumentToZohoResult =
  | { ok: true; zoho_id: string | null }
  | { ok: false; error: string };

async function syncBookingInvoiceToZoho(
  admin: SupabaseClient,
  bookingId: string,
): Promise<SyncBillingDocumentToZohoResult> {
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data, error } = await admin
    .from("bookings")
    .select(
      `${ownershipColumn}, paystack_reference, amount_paid_cents, total_paid_cents, zoho_invoice_id, payment_completed_at`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const row = data as {
    paystack_reference?: string | null;
    amount_paid_cents?: number | null;
    total_paid_cents?: number | null;
    zoho_invoice_id?: string | null;
    payment_completed_at?: string | null;
  };

  if (!row.payment_completed_at) return { ok: false, error: "booking_not_paid" };

  const existing = String(row.zoho_invoice_id ?? "").trim();
  if (existing) return { ok: true, zoho_id: existing };

  const amountCents = Math.max(
    0,
    Math.round(Number(row.total_paid_cents ?? row.amount_paid_cents ?? 0)),
  );
  if (amountCents <= 0) return { ok: false, error: "zero_amount" };

  const reference = String(row.paystack_reference ?? bookingId).trim() || bookingId;
  await syncPaidBookingSideEffects(admin, { bookingId, reference, amountCents });

  const { data: fresh } = await admin.from("bookings").select("zoho_invoice_id").eq("id", bookingId).maybeSingle();
  const zohoId = String((fresh as { zoho_invoice_id?: string | null } | null)?.zoho_invoice_id ?? "").trim();
  if (!zohoId) return { ok: false, error: "zoho_sync_failed" };
  return { ok: true, zoho_id: zohoId };
}

async function syncMonthlyInvoiceRowToZoho(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<SyncBillingDocumentToZohoResult> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, due_date, status, total_amount_cents, balance_cents, amount_paid_cents, paystack_reference, zoho_invoice_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "monthly_invoice_not_found" };

  const row = data as {
    customer_id: string;
    month: string;
    due_date: string;
    status: string | null;
    total_amount_cents: number | null;
    balance_cents?: number | null;
    amount_paid_cents?: number | null;
    paystack_reference?: string | null;
    zoho_invoice_id?: string | null;
  };

  const existing = String(row.zoho_invoice_id ?? "").trim();
  if (existing) return { ok: true, zoho_id: existing };

  const totalCents = resolveMonthlyInvoiceZohoTotalCents(row);
  const balanceZar = totalCents / 100;
  if (balanceZar <= 0) return { ok: false, error: "zero_balance" };

  const result = await syncMonthlyInvoiceToZohoBooks(admin, {
    invoiceId,
    customerId: row.customer_id,
    month: row.month,
    dueDate: row.due_date,
    balanceZar,
    status: row.status,
  });

  if (!result.ok) return result;

  const status = String(row.status ?? "").toLowerCase();
  const paidCents = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  if (paidCents > 0 && ["paid", "partially_paid"].includes(status)) {
    const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
      invoiceId,
      customerId: row.customer_id,
    });
    const contact = contactRes.ok ? contactRes.contact : null;
    const payRes = await markZohoInvoicePaid({
      zohoInvoiceId: result.zohoInvoiceId,
      amountZar: paidCents / 100,
      paymentDate: todayYmdJhb(),
      reference: String(row.paystack_reference ?? invoiceId).trim() || invoiceId,
      customerEmail: contact?.email,
      customerName: contact?.name,
    });
    if (!payRes.ok) {
      return { ok: false, error: `zoho_mark_paid_failed:${payRes.error}` };
    }
  }

  return { ok: true, zoho_id: result.zohoInvoiceId };
}

async function syncSalesDocumentRowToZoho(
  admin: SupabaseClient,
  documentId: string,
): Promise<SyncBillingDocumentToZohoResult> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, total_cents, zoho_estimate_id, zoho_invoice_id")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    document_type: string;
    status: string;
    total_cents: number;
    zoho_estimate_id?: string | null;
    zoho_invoice_id?: string | null;
  };

  if (String(row.status ?? "").toLowerCase() === "requested") {
    return { ok: false, error: "quote_request_not_priced" };
  }
  if (Math.max(0, Math.round(Number(row.total_cents ?? 0))) <= 0) {
    return { ok: false, error: "zero_total" };
  }

  const isQuote = row.document_type === "quote";
  const existing = isQuote
    ? String(row.zoho_estimate_id ?? "").trim()
    : String(row.zoho_invoice_id ?? "").trim();
  if (existing) return { ok: true, zoho_id: existing };

  const sync = await syncSalesDocumentToZoho(admin, documentId);
  if (!sync.ok) return sync;

  const { data: fresh } = await admin
    .from("sales_documents")
    .select("zoho_estimate_id, zoho_invoice_id, document_type")
    .eq("id", documentId)
    .maybeSingle();

  const freshRow = fresh as {
    document_type?: string;
    zoho_estimate_id?: string | null;
    zoho_invoice_id?: string | null;
  } | null;
  const zohoId =
    freshRow?.document_type === "quote"
      ? String(freshRow?.zoho_estimate_id ?? "").trim()
      : String(freshRow?.zoho_invoice_id ?? "").trim();

  if (!zohoId) return { ok: false, error: "zoho_sync_failed" };
  return { ok: true, zoho_id: zohoId };
}

export async function syncBillingDocumentToZoho(
  admin: SupabaseClient,
  params: { kind: AdminBillingDocumentKind; id: string },
): Promise<SyncBillingDocumentToZohoResult> {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return { ok: false, error: "zoho_not_configured" };
  }

  switch (params.kind) {
    case "booking_invoice":
      return syncBookingInvoiceToZoho(admin, params.id);
    case "monthly_invoice":
      return syncMonthlyInvoiceRowToZoho(admin, params.id);
    case "quote":
    case "sales_invoice":
      return syncSalesDocumentRowToZoho(admin, params.id);
    default:
      return { ok: false, error: "unsupported_kind" };
  }
}

export function billingDocumentCanManualSync(doc: {
  kind: AdminBillingDocumentKind;
  zoho_linked: boolean;
  amount_cents: number;
  status: string;
}): boolean {
  if (doc.zoho_linked) return false;
  if (doc.amount_cents <= 0) return false;
  if (doc.status === "requested") return false;
  return true;
}
