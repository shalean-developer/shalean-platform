import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";
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
  extra_rooms?: number | null;
  suburb: string;
  preferred_date: string | null;
  message: string | null;
  selected_items: SalesDocumentQuoteRequestSelectedItem[];
  request_fingerprint?: string | null;
  attribution?: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
    gclid: string | null;
    fbclid: string | null;
    landing_page_slug: string | null;
  };
};

function attributionText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text.slice(0, 500) : null;
}

function leadSource(input: CustomerQuoteRequestInput["attribution"]): string {
  const source = attributionText(input?.utm_source)?.toLowerCase();
  if (source) return source;
  if (input?.gclid) return "google";
  if (input?.fbclid) return "facebook";
  return "direct";
}

function buildRequestSummary(input: CustomerQuoteRequestInput): string {
  const property = PROPERTY_LABELS[input.property_type] ?? input.property_type;
  const parts = [
    `Property: ${property}`,
    input.bedrooms != null ? `Bedrooms: ${input.bedrooms}` : null,
    input.bathrooms != null ? `Bathrooms: ${input.bathrooms}` : null,
    input.extra_rooms != null ? `Extra rooms: ${input.extra_rooms}` : null,
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
): Promise<{ ok: true; id: string; reused?: boolean } | { ok: false; error: string }> {
  const name = input.customer_name.trim();
  const email = input.customer_email.trim().toLowerCase();
  const phone = input.customer_phone.trim();

  if (name.length < 2) return { ok: false, error: "name_required" };
  if (name.length > 120) return { ok: false, error: "input_too_long" };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (phone.length < 9) return { ok: false, error: "phone_required" };
  if (phone.length > 32) return { ok: false, error: "input_too_long" };
  if (!input.suburb.trim()) return { ok: false, error: "suburb_required" };
  if (input.suburb.trim().length > 120) return { ok: false, error: "input_too_long" };
  if ((input.message?.trim().length ?? 0) > 2_000) return { ok: false, error: "input_too_long" };
  if (!input.selected_items.length) return { ok: false, error: "selection_required" };
  if (input.selected_items.length > 20) return { ok: false, error: "invalid_selection" };

  const fingerprintRaw = input.request_fingerprint?.trim() || null;
  if (fingerprintRaw && !/^[0-9a-f]{64}$/i.test(fingerprintRaw)) {
    return { ok: false, error: "invalid_request_fingerprint" };
  }
  const fingerprint = fingerprintRaw;
  if (fingerprint) {
    const { data: existing, error: existingErr } = await admin
      .from("sales_documents")
      .select("id")
      .eq("quote_request_fingerprint", fingerprint)
      .eq("document_type", "quote")
      .eq("source", "customer_request")
      .maybeSingle();
    if (existingErr) return { ok: false, error: existingErr.message };
    if (existing?.id) return { ok: true, id: String(existing.id), reused: true };
  }

  const selected_items = input.selected_items.map((item) => ({
    kind: item.kind,
    slug: item.slug.trim().slice(0, 120),
    name: item.name.trim().slice(0, 160),
    quantity: Math.max(1, Math.min(20, Math.round(item.quantity))),
  }));

  const requestDetails: SalesDocumentQuoteRequestDetails = {
    property_type: input.property_type,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    extra_rooms: input.extra_rooms ?? null,
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
      crm_stage: "lead",
      crm_next_follow_up_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      lead_source: leadSource(input.attribution),
      utm_source: attributionText(input.attribution?.utm_source),
      utm_medium: attributionText(input.attribution?.utm_medium),
      utm_campaign: attributionText(input.attribution?.utm_campaign),
      utm_term: attributionText(input.attribution?.utm_term),
      utm_content: attributionText(input.attribution?.utm_content),
      quote_request_fingerprint: fingerprint,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505" && fingerprint) {
      const { data: raced } = await admin
        .from("sales_documents")
        .select("id")
        .eq("quote_request_fingerprint", fingerprint)
        .eq("document_type", "quote")
        .eq("source", "customer_request")
        .maybeSingle();
      if (raced?.id) return { ok: true, id: String(raced.id), reused: true };
    }
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  const id = String((data as { id: string }).id);

  const customerResult = await ensureSalesDocumentCustomer(admin, id);
  if (!customerResult.ok) {
    await logSystemEvent({
      level: "warn",
      source: "sales_document/quote_request",
      message: "customer_link_recovery_required",
      context: { documentId: id, error: customerResult.error },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/quote_request",
    message: "customer_quote_request.created",
    context: { documentId: id, email, suburb: requestDetails.suburb },
  });

  try {
    await notifyAdminCustomerQuoteRequest(admin, {
      documentId: id,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      requestDetails,
    });
  } catch (err) {
    await logSystemEvent({
      level: "warn",
      source: "sales_document/quote_request",
      message: "admin_notification_failed",
      context: { documentId: id, error: err instanceof Error ? err.message : String(err) },
    });
  }

  return { ok: true, id };
}
