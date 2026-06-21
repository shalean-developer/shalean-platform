import { NextResponse } from "next/server";

import { createCustomerQuoteRequest } from "@/lib/salesDocument/createCustomerQuoteRequest";
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

  const selected_items = parseSelectedItems(body.selected_items);
  if (!selected_items.length) {
    return NextResponse.json({ error: "selection_required" }, { status: 400 });
  }

  const preferredRaw = typeof body.preferred_date === "string" ? body.preferred_date.trim() : "";
  const preferred_date =
    preferredRaw && /^\d{4}-\d{2}-\d{2}$/.test(preferredRaw) ? preferredRaw : null;

  const result = await createCustomerQuoteRequest(admin, {
    customer_name: String(body.customer_name ?? ""),
    customer_email: String(body.customer_email ?? ""),
    customer_phone: String(body.customer_phone ?? ""),
    property_type: propertyType,
    bedrooms: parseOptionalInt(body.bedrooms),
    bathrooms: parseOptionalInt(body.bathrooms),
    suburb: String(body.suburb ?? ""),
    preferred_date,
    message: typeof body.message === "string" ? body.message : null,
    selected_items,
  });

  if (!result.ok) {
    const status =
      result.error === "invalid_email" || result.error.endsWith("_required") ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, requestId: result.id });
}
