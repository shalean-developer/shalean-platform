export type SalesDocumentType = "quote" | "invoice";

export type SalesDocumentStatus =
  | "requested"
  | "draft"
  | "sent"
  | "accepted"
  | "paid"
  | "refunded"
  | "void"
  | "expired";

export type SalesDocumentSource = "admin" | "customer_request";

export type SalesDocumentQuoteRequestSelectedItem = {
  kind: "service" | "extra";
  slug: string;
  name: string;
  quantity: number;
};

export type SalesDocumentQuoteRequestDetails = {
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  suburb: string;
  preferred_date: string | null;
  message: string | null;
  selected_items: SalesDocumentQuoteRequestSelectedItem[];
  submitted_at: string;
  /** Legacy field from early quote form — optional. */
  service_type?: string;
};

export type SalesDocumentLineItem = {
  description: string;
  quantity: number;
  unit_price_cents: number;
};

export type SalesDocumentRow = {
  id: string;
  document_type: SalesDocumentType;
  status: SalesDocumentStatus;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  line_items: SalesDocumentLineItem[];
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  due_date: string | null;
  notes: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  converted_from_id: string | null;
  public_token: string;
  paystack_reference: string | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  amount_paid_cents: number;
  balance_cents: number;
  zoho_estimate_id: string | null;
  zoho_invoice_id: string | null;
  created_by: string | null;
  source?: SalesDocumentSource;
  request_details?: SalesDocumentQuoteRequestDetails | null;
  refund_reference: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
};

const NON_EDITABLE_STATUSES = new Set(["paid", "refunded", "void", "expired"]);

/** Quotes and invoices may be edited until a payment is recorded. */
export function salesDocumentIsEditableWithoutPayment(params: {
  document_type: SalesDocumentType;
  status: string;
  amount_paid_cents: number;
}): boolean {
  const st = String(params.status ?? "").toLowerCase();
  if (NON_EDITABLE_STATUSES.has(st)) return false;
  if (Math.max(0, Math.round(Number(params.amount_paid_cents ?? 0))) > 0) return false;
  return true;
}

/** Unpaid quotes and invoices may be deleted (same rules as editing). */
export function salesDocumentIsDeletable(params: {
  document_type: SalesDocumentType;
  status: string;
  amount_paid_cents: number;
}): boolean {
  return salesDocumentIsEditableWithoutPayment(params);
}

export function parseSalesDocumentLineItems(raw: unknown): SalesDocumentLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const description = String(o.description ?? "").trim();
      const quantity = Number(o.quantity ?? 1);
      const unit_price_cents = Math.round(Number(o.unit_price_cents ?? 0));
      if (!description || quantity <= 0 || unit_price_cents < 0) return null;
      return { description, quantity, unit_price_cents };
    })
    .filter((x): x is SalesDocumentLineItem => x !== null);
}

export function computeSalesDocumentTotals(lineItems: SalesDocumentLineItem[]): {
  subtotal_cents: number;
  total_cents: number;
} {
  const subtotal_cents = lineItems.reduce(
    (sum, li) => sum + Math.round(li.quantity * li.unit_price_cents),
    0,
  );
  return { subtotal_cents, total_cents: subtotal_cents };
}

export function salesDocumentLineItemsToZoho(lineItems: SalesDocumentLineItem[]) {
  return lineItems.map((li) => ({
    name: li.description.slice(0, 100),
    description: li.description,
    rate: li.unit_price_cents / 100,
    quantity: li.quantity,
  }));
}
