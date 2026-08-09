import { NextResponse } from "next/server";

import { createCustomerQuoteRequest } from "@/lib/salesDocument/createCustomerQuoteRequest";
import { loadQuotePricingCatalog } from "@/lib/quote/loadQuotePricingCatalog";
import { resolveQuoteRequestSelection } from "@/lib/quote/resolveQuoteRequestSelection";
import type { SalesDocumentQuoteRequestSelectedItem } from "@/lib/salesDocument/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROPERTY_TYPES = new Set(["apartment", "house", "office"]);

function parseOptionalInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return n;
}

function parseSelectedItems(raw: unknown): SalesDocumentQuoteRequestSelectedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SalesDocumentQuoteRequestSelectedItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const kind = o.kind === "extra" ? "extra" : o.kind === "service" ? "service" : null;
    const slug = String(o.slug ?? "").trim();
    const name = String(o.name ?? "").trim();
    if (!kind || !slug || !name) continue;
    const quantity = Math.max(1, Math.round(Number(o.quantity ?? 1)));
    out.push({ kind, slug, name, quantity });
  }
  return out;
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const propertyType = String(body.property_type ?? "apartment").trim();
  if (!PROPERTY_TYPES.has(propertyType)) {
    return NextResponse.json({ error: "invalid_property_type" }, { status: 400 });
  }

  const requestedItems = parseSelectedItems(body.selected_items);
  if (!requestedItems.length) {
    return NextResponse.json({ error: "selection_required" }, { status: 400 });
  }

  const preferredRaw = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
  const preferred_date =
    preferredRaw && /^\d{4}-\d{2}-\d{2}$/.test(preferredRaw) ? preferredRaw : null;

  const bedrooms = parseOptionalInt(body.bedrooms);
  const bathrooms = parseOptionalInt(body.bathrooms);
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

  const result = await createCustomerQuoteRequest(admin, {
    customer_name: String(body.customer_name ?? ""),
    customer_email: String(body.customer_email ?? ""),
    customer_phone: String(body.customer_phone ?? ""),
    property_type: propertyType,
    bedrooms,
    bathrooms,
    suburb: String(body.suburb ?? ""),
    preferred_date,
    message: typeof body.message === "string" ? body.message : null,
    selected_items,
    attribution: {
      utm_source: typeof body.utm_source === "string" ? body.utm_source : null,
      utm_medium: typeof body.utm_medium === "string" ? body.utm_medium : null,
      utm_campaign: typeof body.utm_campaign === "string" ? body.utm_campaign : null,
      utm_term: typeof body.utm_term === "string" ? body.utm_term : null,
      utm_content: typeof body.utm_content === "string" ? body.utm_content : null,
      gclid: typeof body.gclid === "string" ? body.gclid : null,
      fbclid: typeof body.fbclid === "string" ? body.fbclid : null,
      landing_page_slug: typeof body.landing_page_slug === "string" ? body.landing_page_slug : null,
    },
  });

  if (!result.ok) {
    const status =
      result.error === "invalid_email" || result.error.endsWith("_required") ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, requestId: result.id });
}
