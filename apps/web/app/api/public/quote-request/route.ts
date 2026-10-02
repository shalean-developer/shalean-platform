import { NextResponse } from "next/server";

import { createCustomerQuoteRequest } from "@/lib/salesDocument/createCustomerQuoteRequest";
import { loadQuotePricingCatalog } from "@/lib/quote/loadQuotePricingCatalog";
import { resolveQuoteRequestSelection } from "@/lib/quote/resolveQuoteRequestSelection";
import type { SalesDocumentQuoteRequestSelectedItem } from "@/lib/salesDocument/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkPublicQuoteEmailLimit,
  checkPublicQuoteIpLimit,
  publicQuoteRateLimitResponse,
} from "@/lib/rateLimit/publicQuoteRequestLimit";
import { buildCustomerQuoteRequestFingerprint } from "@/lib/salesDocument/customerQuoteRequestFingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROPERTY_TYPES = new Set(["apartment", "house", "office"]);
const MAX_BODY_BYTES = 24_000;
const MAX_SELECTED_ITEMS = 20;
const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 32;
const MAX_SUBURB = 120;
const MAX_MESSAGE = 2_000;
const MAX_ATTRIBUTION = 500;

function boundedString(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return value.length <= max ? value : null;
}

function parseOptionalInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return n;
}

function parseSelectedItems(raw: unknown): SalesDocumentQuoteRequestSelectedItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED_ITEMS) return null;
  const out: SalesDocumentQuoteRequestSelectedItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const o = entry as Record<string, unknown>;
    const kind = o.kind === "extra" ? "extra" : o.kind === "service" ? "service" : null;
    const slug = boundedString(o.slug, 120);
    const name = boundedString(o.name, 160);
    const quantity = Math.round(Number(o.quantity ?? 1));
    if (!kind || !slug || !name || !Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
      return null;
    }
    out.push({ kind, slug, name, quantity });
  }
  return out;
}

export async function POST(request: Request) {
  const ipDecision = checkPublicQuoteIpLimit(request);
  if (!ipDecision.allowed) return publicQuoteRateLimitResponse(ipDecision);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const propertyType = String(body.property_type ?? "apartment").trim();
  if (!PROPERTY_TYPES.has(propertyType)) {
    return NextResponse.json({ error: "invalid_property_type" }, { status: 400 });
  }

  const requestedItems = parseSelectedItems(body.selected_items);
  if (!requestedItems?.length) {
    return NextResponse.json({ error: "invalid_selection" }, { status: 400 });
  }

  const preferredRaw = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
  const preferred_date =
    preferredRaw && /^\d{4}-\d{2}-\d{2}$/.test(preferredRaw) ? preferredRaw : null;

  const bedrooms = parseOptionalInt(body.bedrooms);
  const bathrooms = parseOptionalInt(body.bathrooms);

  const customerName = boundedString(body.customer_name, MAX_NAME);
  const customerEmail = boundedString(body.customer_email, MAX_EMAIL);
  const customerPhone = boundedString(body.customer_phone, MAX_PHONE);
  const suburb = boundedString(body.suburb, MAX_SUBURB);
  const message = body.message == null ? "" : boundedString(body.message, MAX_MESSAGE);
  if (
    customerName === null ||
    customerEmail === null ||
    customerPhone === null ||
    suburb === null ||
    message === null
  ) {
    return NextResponse.json({ error: "input_too_long" }, { status: 400 });
  }

  const emailDecision = checkPublicQuoteEmailLimit(customerEmail);
  if (!emailDecision.allowed) return publicQuoteRateLimitResponse(emailDecision);

  let selected_items: SalesDocumentQuoteRequestSelectedItem[] | null = null;
  try {
    const catalog = await loadQuotePricingCatalog(admin);
    selected_items = resolveQuoteRequestSelection({
      requested: requestedItems,
      services: catalog.services,
      bedrooms,
      bathrooms,
    });
  } catch {
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
  if (!selected_items) {
    return NextResponse.json({ error: "invalid_selection" }, { status: 400 });
  }

  const attributionValues = {
    utm_source: body.utm_source == null ? "" : boundedString(body.utm_source, MAX_ATTRIBUTION),
    utm_medium: body.utm_medium == null ? "" : boundedString(body.utm_medium, MAX_ATTRIBUTION),
    utm_campaign: body.utm_campaign == null ? "" : boundedString(body.utm_campaign, MAX_ATTRIBUTION),
    utm_term: body.utm_term == null ? "" : boundedString(body.utm_term, MAX_ATTRIBUTION),
    utm_content: body.utm_content == null ? "" : boundedString(body.utm_content, MAX_ATTRIBUTION),
    gclid: body.gclid == null ? "" : boundedString(body.gclid, 300),
    fbclid: body.fbclid == null ? "" : boundedString(body.fbclid, 300),
    landing_page_slug:
      body.landing_page_slug == null ? "" : boundedString(body.landing_page_slug, 300),
  };
  if (Object.values(attributionValues).some((value) => value === null)) {
    return NextResponse.json({ error: "input_too_long" }, { status: 400 });
  }

  const requestFingerprint = buildCustomerQuoteRequestFingerprint({
    customerName,
    customerEmail,
    customerPhone,
    propertyType,
    bedrooms,
    bathrooms,
    suburb,
    preferredDate: preferred_date,
    message: message || null,
    selectedItems: selected_items,
  });

  const result = await createCustomerQuoteRequest(admin, {
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    property_type: propertyType,
    bedrooms,
    bathrooms,
    suburb,
    preferred_date,
    message: message || null,
    selected_items,
    request_fingerprint: requestFingerprint,
    attribution: {
      utm_source: attributionValues.utm_source || null,
      utm_medium: attributionValues.utm_medium || null,
      utm_campaign: attributionValues.utm_campaign || null,
      utm_term: attributionValues.utm_term || null,
      utm_content: attributionValues.utm_content || null,
      gclid: attributionValues.gclid || null,
      fbclid: attributionValues.fbclid || null,
      landing_page_slug: attributionValues.landing_page_slug || null,
    },
  });

  if (!result.ok) {
    const status =
      result.error === "invalid_email" || result.error.endsWith("_required") ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, requestId: result.id, reused: Boolean(result.reused) });
}
