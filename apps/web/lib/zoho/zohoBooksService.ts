import "server-only";

import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";
import type {
  ZohoContactCreateResponse,
  ZohoContactListResponse,
  ZohoInvoiceCreateResponse,
  ZohoInvoiceInput,
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
 * Looks up a customer contact id via Zoho's `search_text` (matches across name,
 * email, etc.). When `matchEmail` is provided we prefer an exact email match,
 * otherwise we fall back to the first customer contact returned.
 */
async function findContactId(query: string, matchEmail?: string): Promise<string | null> {
  const res = await zohoBooksClient.get<ZohoContactListResponse>(
    `/contacts?contact_type=customer&search_text=${encodeURIComponent(query)}`,
  );
  const contacts = res.contacts ?? [];
  if (matchEmail) {
    const exact = contacts.find((c) => c.email?.toLowerCase() === matchEmail.toLowerCase());
    if (exact) return exact.contact_id;
  }
  return contacts[0]?.contact_id ?? null;
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
  email: string;
  name: string;
  phone?: string;
}): Promise<ServiceResult<{ contactId: string }>> {
  try {
    const existingId = await findContactId(params.email, params.email);
    if (existingId) return { ok: true, contactId: existingId };

    try {
      const createRes = await zohoBooksClient.post<ZohoContactCreateResponse>("/contacts", {
        contact_name: params.name,
        contact_type: "customer",
        email: params.email,
        ...(params.phone ? { phone: params.phone } : {}),
      });
      return { ok: true, contactId: createRes.contact.contact_id };
    } catch (createErr) {
      const msg = String(createErr instanceof Error ? createErr.message : createErr);
      // 3062 = contact name already exists — resolve the existing contact instead.
      if (msg.includes("3062") || /already exists/i.test(msg)) {
        const fallbackId =
          (await findContactId(params.email, params.email)) ?? (await findContactId(params.name));
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
  /** Shalean internal invoice/booking ID for the invoice_number and reference */
  referenceId: string;
  /** Customer's email address */
  customerEmail: string;
  /** Customer's display name */
  customerName: string;
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
    });

    if (!contactResult.ok) {
      return { ok: false, error: `contact_resolution: ${contactResult.error}` };
    }

    const invoiceInput: ZohoInvoiceInput = {
      customer_id: contactResult.contactId,
      // Intentionally omit `invoice_number` — many Zoho orgs auto-generate it and
      // reject a custom value (code 4097). Our booking id stays in reference_number.
      reference_number: params.referenceId,
      date: params.invoiceDate,
      due_date: params.dueDate,
      line_items: params.lineItems,
      notes: params.notes ?? "Thank you for booking with Shalean.",
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

/**
 * Fetches the PDF rendering of a Zoho Books invoice.
 * Used by Shalean's in-app invoice proxy routes so customers and admins can
 * view/download the Zoho-generated invoice without leaving the app.
 */
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
        name: params.customerName ?? params.customerEmail,
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
