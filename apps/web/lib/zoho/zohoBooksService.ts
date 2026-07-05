import "server-only";

import { normalizeBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";
import { formatZohoOrderReference, type ZohoOrderKind } from "@/lib/zoho/zohoOrderReference";
import type {
  ZohoContactCreateResponse,
  ZohoContactListResponse,
  ZohoEstimateCreateResponse,
  ZohoEstimateUpdateResponse,
  ZohoInvoiceCreateResponse,
  ZohoInvoiceInput,
  ZohoInvoiceUpdateResponse,
  ZohoLineItem,
  ZohoPaymentCreateResponse,
} from "@/lib/zoho/types";

/**
 * High-level Zoho Books service.
 *
 * All methods are fire-and-forget safe: they never throw to callers —
 * errors are returned as `{ ok: false, error: string }` so billing flows
 * are not interrupted by a transient Zoho API failure.
 */

type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ─── Contacts ────────────────────────────────────────────────────────────────

/**
 * Looks up a customer contact id in Zoho Books.
 * Never returns an unrelated first search hit when an exact match was required.
 */
async function findContactId(options: {
  email?: string | null;
  contactName?: string | null;
}): Promise<string | null> {
  const billingEmail = normalizeBillingEmail(options.email);
  const contactName = String(options.contactName ?? "").trim();

  if (billingEmail) {
    const res = await zohoBooksClient.get<ZohoContactListResponse>(
      `/contacts?contact_type=customer&search_text=${encodeURIComponent(billingEmail)}`,
    );
    const contacts = res.contacts ?? [];
    const byEmail = contacts.find((c) => c.email?.toLowerCase() === billingEmail.toLowerCase());
    if (byEmail) return byEmail.contact_id;
    // Legacy rows where contact_name was wrongly set to the email string.
    const legacy = contacts.find((c) => c.contact_name?.toLowerCase() === billingEmail.toLowerCase());
    if (legacy) return legacy.contact_id;
  }

  if (contactName.length >= 2) {
    const res = await zohoBooksClient.get<ZohoContactListResponse>(
      `/contacts?contact_type=customer&search_text=${encodeURIComponent(contactName)}`,
    );
    const contacts = res.contacts ?? [];
    const exact = contacts.find((c) => c.contact_name?.trim().toLowerCase() === contactName.toLowerCase());
    if (exact) return exact.contact_id;
  }

  return null;
}

/**
 * Returns the Zoho contact ID for a customer. Creates a new contact if one
 * with the given email does not yet exist in Zoho Books.
 *
 * Zoho requires globally-unique `contact_name`, and its list filter can miss
 * existing rows, so we (1) search by email, (2) attempt create, and (3) on a
 * duplicate error (code 3062) re-resolve the existing contact instead of failing.
 */
export async function getOrCreateContact(params: {
  email?: string;
  name: string;
  phone?: string;
}): Promise<ServiceResult<{ contactId: string }>> {
  try {
    const billingEmail = normalizeBillingEmail(params.email);
    const contactName = params.name.trim();
    if (contactName.length < 2) {
      return { ok: false, error: "contact_name_required" };
    }

    const existingId = await findContactId({ email: billingEmail, contactName });
    if (existingId) return { ok: true, contactId: existingId };

    try {
      const createRes = await zohoBooksClient.post<ZohoContactCreateResponse>("/contacts", {
        contact_name: contactName,
        contact_type: "customer",
        ...(billingEmail ? { email: billingEmail } : {}),
        ...(params.phone ? { phone: params.phone } : {}),
      });
      return { ok: true, contactId: createRes.contact.contact_id };
    } catch (createErr) {
      const msg = String(createErr instanceof Error ? createErr.message : createErr);
      // 3062 = contact name already exists — resolve the existing contact instead.
      if (msg.includes("3062") || /already exists/i.test(msg)) {
        const fallbackId =
          (await findContactId({ email: billingEmail, contactName })) ??
          (billingEmail ? await findContactId({ email: billingEmail }) : null);
        if (fallbackId) return { ok: true, contactId: fallbackId };
      }
      throw createErr;
    }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type CreateInvoiceParams = {
  /** Shalean internal booking or monthly_invoice UUID (stored in notes for traceability). */
  referenceId: string;
  /** Sets BK-/MI- prefix on Zoho `reference_number`. Defaults to "booking". */
  orderKind?: ZohoOrderKind;
  /** Override short order number shown in Zoho (defaults from referenceId + orderKind). */
  orderReference?: string;
  /** Customer billing email when known (never a Shalean login alias). */
  customerEmail?: string;
  /** Customer's display name */
  customerName: string;
  /** Customer phone (stored on Zoho contact when provided) */
  customerPhone?: string;
  /** Line items (service, add-ons, etc.) */
  lineItems: ZohoLineItem[];
  /** ISO date string "YYYY-MM-DD" */
  invoiceDate: string;
  /** ISO date string "YYYY-MM-DD" */
  dueDate: string;
  /** Optional notes/memo visible on the invoice */
  notes?: string;
  /** ISO-4217 currency code. Defaults to "ZAR". */
  currencyCode?: string;
};

/**
 * Creates a Zoho Books invoice for a customer, auto-creating the contact if
 * needed. Returns the Zoho invoice ID on success.
 */
export async function createZohoInvoice(
  params: CreateInvoiceParams,
): Promise<ServiceResult<{ zohoInvoiceId: string; invoiceNumber: string }>> {
  try {
    // Resolve or create contact
    const contactResult = await getOrCreateContact({
      email: params.customerEmail,
      name: params.customerName,
      phone: params.customerPhone,
    });

    if (!contactResult.ok) {
      return { ok: false, error: `contact_resolution: ${contactResult.error}` };
    }

    const orderKind = params.orderKind ?? "booking";
    const referenceNumber =
      params.orderReference ?? formatZohoOrderReference(params.referenceId, orderKind);
    const traceNote = `Shalean id: ${params.referenceId}`;
    const notes = params.notes ? `${params.notes}\n${traceNote}` : `${traceNote}\nThank you for booking with Shalean.`;

    const invoiceInput: ZohoInvoiceInput = {
      customer_id: contactResult.contactId,
      // Intentionally omit `invoice_number` — Zoho auto-generates INV-000xxx.
      // Short Shalean order number (e.g. BK-C44BD9D4) goes in reference_number.
      reference_number: referenceNumber,
      date: params.invoiceDate,
      due_date: params.dueDate,
      line_items: params.lineItems,
      notes,
      currency_code: params.currencyCode ?? "ZAR",
    };

    const res = await zohoBooksClient.post<ZohoInvoiceCreateResponse>("/invoices", invoiceInput);
    return {
      ok: true,
      zohoInvoiceId: res.invoice.invoice_id,
      invoiceNumber: res.invoice.invoice_number,
    };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export type UpdateInvoiceParams = {
  zohoInvoiceId: string;
  customerEmail?: string;
  customerName: string;
  customerPhone?: string;
  lineItems: ZohoLineItem[];
  invoiceDate: string;
  dueDate: string;
  notes?: string;
  currencyCode?: string;
};

/**
 * Updates an existing Zoho Books draft invoice (line items, dates, totals).
 * Zoho rejects edits on sent/paid invoices — callers should only use for drafts.
 */
export async function updateZohoInvoice(
  params: UpdateInvoiceParams,
): Promise<ServiceResult<{ zohoInvoiceId: string; invoiceNumber: string }>> {
  try {
    const id = params.zohoInvoiceId.trim();
    if (!id) return { ok: false, error: "missing_invoice_id" };

    const contactResult = await getOrCreateContact({
      email: params.customerEmail,
      name: params.customerName,
      phone: params.customerPhone,
    });
    if (!contactResult.ok) {
      return { ok: false, error: `contact_resolution: ${contactResult.error}` };
    }

    const res = await zohoBooksClient.put<ZohoInvoiceUpdateResponse>(`/invoices/${encodeURIComponent(id)}`, {
      customer_id: contactResult.contactId,
      date: params.invoiceDate,
      due_date: params.dueDate,
      line_items: params.lineItems,
      ...(params.notes ? { notes: params.notes } : {}),
      currency_code: params.currencyCode ?? "ZAR",
    });

    return {
      ok: true,
      zohoInvoiceId: res.invoice.invoice_id,
      invoiceNumber: res.invoice.invoice_number,
    };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

/**
 * Fetches the PDF rendering of a Zoho Books invoice.
 * Used by Shalean's in-app invoice proxy routes so customers and admins can
 * view/download the Zoho-generated invoice without leaving the app.
 */
/** Returns true when the invoice id resolves in the configured Zoho Books org. */
/** Voids a Zoho invoice (draft/sent). Paid invoices may fail — caller should log and continue. */
export async function voidZohoInvoice(zohoInvoiceId: string): Promise<ServiceResult<{ voided: true }>> {
  const id = zohoInvoiceId.trim();
  if (!id) return { ok: false, error: "missing_invoice_id" };
  try {
    await zohoBooksClient.post(`/invoices/${encodeURIComponent(id)}/status/void`, {});
    return { ok: true, voided: true };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function deleteZohoEstimate(zohoEstimateId: string): Promise<ServiceResult<{ deleted: true }>> {
  const id = zohoEstimateId.trim();
  if (!id) return { ok: false, error: "missing_estimate_id" };
  try {
    await zohoBooksClient.delete(`/estimates/${encodeURIComponent(id)}`);
    return { ok: true, deleted: true };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function zohoInvoiceExists(zohoInvoiceId: string): Promise<boolean | "unknown"> {
  const id = zohoInvoiceId.trim();
  if (!id) return false;
  try {
    await zohoBooksClient.get(`/invoices/${encodeURIComponent(id)}`);
    return true;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("[429]") || msg.includes("code=45")) return "unknown";
    return false;
  }
}

export async function getZohoInvoicePdf(
  zohoInvoiceId: string,
): Promise<ServiceResult<{ pdf: ArrayBuffer }>> {
  try {
    const pdf = await zohoBooksClient.getPdf(
      `/invoices/${encodeURIComponent(zohoInvoiceId)}?accept=pdf`,
    );
    return { ok: true, pdf };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export type CreateEstimateParams = {
  referenceId: string;
  orderReference?: string;
  customerEmail?: string;
  customerName: string;
  customerPhone?: string;
  lineItems: ZohoLineItem[];
  estimateDate: string;
  expiryDate?: string;
  notes?: string;
  currencyCode?: string;
};

export async function createZohoEstimate(
  params: CreateEstimateParams,
): Promise<ServiceResult<{ zohoEstimateId: string; estimateNumber: string }>> {
  try {
    const contactResult = await getOrCreateContact({
      email: params.customerEmail,
      name: params.customerName,
      phone: params.customerPhone,
    });
    if (!contactResult.ok) {
      return { ok: false, error: `contact_resolution: ${contactResult.error}` };
    }

    const referenceNumber =
      params.orderReference ?? formatZohoOrderReference(params.referenceId, "sales");
    const traceNote = `Shalean id: ${params.referenceId}`;
    const notes = params.notes ? `${params.notes}\n${traceNote}` : `${traceNote}\nThank you for considering Shalean.`;

    const res = await zohoBooksClient.post<ZohoEstimateCreateResponse>("/estimates", {
      customer_id: contactResult.contactId,
      reference_number: referenceNumber,
      date: params.estimateDate,
      ...(params.expiryDate ? { expiry_date: params.expiryDate } : {}),
      line_items: params.lineItems,
      notes,
      currency_code: params.currencyCode ?? "ZAR",
    });

    return {
      ok: true,
      zohoEstimateId: res.estimate.estimate_id,
      estimateNumber: res.estimate.estimate_number,
    };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export type UpdateEstimateParams = {
  zohoEstimateId: string;
  customerEmail?: string;
  customerName: string;
  customerPhone?: string;
  lineItems: ZohoLineItem[];
  estimateDate: string;
  expiryDate?: string;
  notes?: string;
  currencyCode?: string;
};

export async function updateZohoEstimate(
  params: UpdateEstimateParams,
): Promise<ServiceResult<{ zohoEstimateId: string; estimateNumber: string }>> {
  try {
    const id = params.zohoEstimateId.trim();
    if (!id) return { ok: false, error: "missing_estimate_id" };

    const contactResult = await getOrCreateContact({
      email: params.customerEmail,
      name: params.customerName,
      phone: params.customerPhone,
    });
    if (!contactResult.ok) {
      return { ok: false, error: `contact_resolution: ${contactResult.error}` };
    }

    const res = await zohoBooksClient.put<ZohoEstimateUpdateResponse>(
      `/estimates/${encodeURIComponent(id)}`,
      {
        customer_id: contactResult.contactId,
        date: params.estimateDate,
        ...(params.expiryDate ? { expiry_date: params.expiryDate } : {}),
        line_items: params.lineItems,
        ...(params.notes ? { notes: params.notes } : {}),
        currency_code: params.currencyCode ?? "ZAR",
      },
    );

    return {
      ok: true,
      zohoEstimateId: res.estimate.estimate_id,
      estimateNumber: res.estimate.estimate_number,
    };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

export async function getZohoEstimatePdf(
  zohoEstimateId: string,
): Promise<ServiceResult<{ pdf: ArrayBuffer }>> {
  try {
    const pdf = await zohoBooksClient.getPdf(
      `/estimates/${encodeURIComponent(zohoEstimateId)}?accept=pdf`,
    );
    return { ok: true, pdf };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type MarkInvoicePaidParams = {
  zohoInvoiceId: string;
  /** Amount in ZAR (not cents) */
  amountZar: number;
  /** ISO date "YYYY-MM-DD" */
  paymentDate: string;
  /** Paystack reference or any external reference */
  reference?: string;
  /** Contact ID (optional; looked up from invoice if omitted) */
  contactId?: string;
  /** Customer email (used for contact lookup if contactId absent) */
  customerEmail?: string;
  /** Customer name (used for contact creation if contactId absent) */
  customerName?: string;
};

/**
 * Records a payment against an existing Zoho Books invoice.
 * Uses "bank_transfer" as payment mode (override with your preferred mode).
 */
export async function markZohoInvoicePaid(
  params: MarkInvoicePaidParams,
): Promise<ServiceResult<{ paymentId: string }>> {
  try {
    let contactId = params.contactId;

    if (!contactId) {
      if (!params.customerEmail) {
        return { ok: false, error: "contactId or customerEmail required" };
      }
      const cr = await getOrCreateContact({
        email: params.customerEmail,
        name: params.customerName ?? params.customerEmail ?? "Customer",
      });
      if (!cr.ok) return { ok: false, error: `contact_resolution: ${cr.error}` };
      contactId = cr.contactId;
    }

    const res = await zohoBooksClient.post<ZohoPaymentCreateResponse>("/customerpayments", {
      customer_id: contactId,
      payment_mode: "bank_transfer",
      amount: params.amountZar,
      date: params.paymentDate,
      invoices: [
        {
          invoice_id: params.zohoInvoiceId,
          amount_applied: params.amountZar,
        },
      ],
      ...(params.reference ? { reference_number: params.reference } : {}),
    });

    return { ok: true, paymentId: res.payment.payment_id };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns today's date as "YYYY-MM-DD" in Johannesburg time.
 * Used when we need an invoice date but only have a timestamp.
 *
 * Built from `formatToParts` so the output is locale-independent — string
 * reversing en-ZA (`YYYY/MM/DD`) previously produced an invalid `DD-MM-YYYY`
 * that Zoho rejected with "Invalid value passed for Invoice Date".
 */
export function todayYmdJhb(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
