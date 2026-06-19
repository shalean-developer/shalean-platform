import { NextResponse } from "next/server";
import { normalizeCatalogSlug } from "@/lib/admin/officePricingTypes";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("pricing_services")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ services: [], message: "Run migration 20260476_admin_pricing_tables.sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    base_price?: unknown;
    price_per_bedroom?: unknown;
    price_per_bathroom?: unknown;
    min_hours?: unknown;
    max_hours?: unknown;
    is_active?: unknown;
    sort_order?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.slug === "string") {
    const slug = normalizeCatalogSlug(body.slug);
    if (slug) patch.slug = slug;
  }
  if (typeof body.base_price === "number" && Number.isFinite(body.base_price)) patch.base_price = Math.max(0, Math.round(body.base_price));
  if (typeof body.price_per_bedroom === "number" && Number.isFinite(body.price_per_bedroom)) {
    patch.price_per_bedroom = Math.max(0, Math.round(body.price_per_bedroom));
  }
  if (typeof body.price_per_bathroom === "number" && Number.isFinite(body.price_per_bathroom)) {
    patch.price_per_bathroom = Math.max(0, Math.round(body.price_per_bathroom));
  }
  if (typeof body.min_hours === "number" && Number.isFinite(body.min_hours)) patch.min_hours = Math.max(0.25, Math.min(24, body.min_hours));
  if (typeof body.max_hours === "number" && Number.isFinite(body.max_hours)) patch.max_hours = Math.max(0.25, Math.min(24, body.max_hours));
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) patch.sort_order = Math.round(body.sort_order);

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No updatable fields." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("pricing_services").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    slug?: unknown;
    name?: unknown;
    base_price?: unknown;
    price_per_bedroom?: unknown;
    price_per_bathroom?: unknown;
    min_hours?: unknown;
    max_hours?: unknown;
    is_active?: unknown;
    sort_order?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? normalizeCatalogSlug(body.slug) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const basePrice = typeof body.base_price === "number" && Number.isFinite(body.base_price) ? Math.max(0, Math.round(body.base_price)) : 0;

  if (!slug) return NextResponse.json({ error: "slug required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: maxRow } = await admin
    .from("pricing_services")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort =
    typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.round(body.sort_order)
      : Math.round(Number((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10);

  const row = {
    slug,
    name,
    base_price: basePrice,
    price_per_bedroom:
      typeof body.price_per_bedroom === "number" && Number.isFinite(body.price_per_bedroom)
        ? Math.max(0, Math.round(body.price_per_bedroom))
        : 0,
    price_per_bathroom:
      typeof body.price_per_bathroom === "number" && Number.isFinite(body.price_per_bathroom)
        ? Math.max(0, Math.round(body.price_per_bathroom))
        : 0,
    min_hours:
      typeof body.min_hours === "number" && Number.isFinite(body.min_hours)
        ? Math.max(0.25, Math.min(24, body.min_hours))
        : 2,
    max_hours:
      typeof body.max_hours === "number" && Number.isFinite(body.max_hours)
        ? Math.max(0.25, Math.min(24, body.max_hours))
        : 8,
    is_active: body.is_active !== false,
    sort_order: nextSort,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("pricing_services").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, service: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id query param required." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("pricing_services").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
