import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { notifyAdminCustomerQuoteRequest } from "@/lib/salesDocument/notifySalesDocumentAdmin";
import type {
  SalesDocumentQuoteRequestDetails,
  SalesDocumentQuoteRequestSelectedItem,
} from "@/lib/salesDocument/types";

const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Apartment / flat",
  house: "House",
  office: "Office / commercial",
};

export type CustomerQuoteRequestInput = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  suburb: string;
  preferred_date: string | null;
  message: string | null;
  selected_items: SalesDocumentQuoteRequestSelectedItem[];
};

function buildRequestSummary(input: CustomerQuoteRequestInput): string {
  const property = PROPERTY_LABELS[input.property_type] ?? input.property_type;
  const parts = [
    `Property: ${property}`,
    input.bedrooms != null ? `Bedrooms: ${input.bedrooms}` : null,
    input.bathrooms != null ? `Bathrooms: ${input.bathrooms}` : null,
    `Area: ${input.suburb}`,
    input.selected_items.length
      ? `Requested: ${input.selected_items.map((i) => i.name).join("; ")}`
      : null,
    input.preferred_date ? `Preferred date: ${input.preferred_date}` : null,
    input.message ? `Notes: ${input.message}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

function lineItemsFromSelection(items: SalesDocumentQuoteRequestSelectedItem[]) {
  return items.map((item) => ({
    description: item.name,
    quantity: Math.max(1, Math.round(item.quantity)),
    unit_price_cents: 0,
  }));
}

export async function createCustomerQuoteRequest(
  admin: SupabaseClient,
  input: CustomerQuoteRequestInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.customer_name.trim();
  const email = input.customer_email.trim().toLowerCase();
  const phone = input.customer_phone.trim();

  if (name.length < 2) return { ok: false, error: "name_required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid_email" };
  if (phone.length < 9) return { ok: false, error: "phone_required" };
  if (!input.suburb.trim()) return { ok: false, error: "suburb_required" };
  if (!input.selected_items.length) return { ok: false, error: "selection_required" };

  const selected_items = input.selected_items.map((item) => ({
    kind: item.kind,
    slug: item.slug.trim(),
    name: item.name.trim(),
    quantity: Math.max(1, Math.round(item.quantity)),
  }));

  const requestDetails: SalesDocumentQuoteRequestDetails = {
    property_type: input.property_type,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    suburb: input.suburb.trim(),
    preferred_date: input.preferred_date,
    message: input.message?.trim() || null,
    selected_items,
    submitted_at: new Date().toISOString(),
  };

  const line_items = lineItemsFromSelection(selected_items);

  const { data, error } = await admin
    .from("sales_documents")
    .insert({
      document_type: "quote",
      status: "requested",
      source: "customer_request",
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      line_items,
      subtotal_cents: 0,
      total_cents: 0,
      balance_cents: 0,
      amount_paid_cents: 0,
      notes: buildRequestSummary(input),
      request_details: requestDetails,
      created_by: null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  const id = String((data as { id: string }).id);

  await logSystemEvent({
    level: "info",
    source: "sales_document/quote_request",
    message: "customer_quote_request.created",
    context: { documentId: id, email, suburb: requestDetails.suburb },
  });

  void notifyAdminCustomerQuoteRequest(admin, {
    documentId: id,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    requestDetails,
  });

  return { ok: true, id };
}
