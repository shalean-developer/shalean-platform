import { NextResponse } from "next/server";
import { normalizeCatalogSlug } from "@/lib/admin/officePricingTypes";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_TYPES = new Set(["light", "heavy", "all"]);

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin.from("pricing_extras").select("*").order("sort_order", { ascending: true });

  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ extras: [], message: "Run migration 20260476_admin_pricing_tables.sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ extras: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    price?: unknown;
    service_type?: unknown;
    is_popular?: unknown;
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
  if (typeof body.price === "number" && Number.isFinite(body.price)) patch.price = Math.max(0, Math.round(body.price));
  if (typeof body.service_type === "string") {
    const st = body.service_type.trim().toLowerCase();
    if (SERVICE_TYPES.has(st)) patch.service_type = st;
  }
  if (typeof body.is_popular === "boolean") patch.is_popular = body.is_popular;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) patch.sort_order = Math.round(body.sort_order);

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No updatable fields." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: before } = await admin.from("pricing_extras").select("*").eq("id", id).maybeSingle();
  const { data: afterRows, error } = await admin
    .from("pricing_extras")
    .update(patch)
    .eq("id", id)
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { recordPricingCatalogAudit } = await import("@/lib/admin/recordPricingCatalogAudit");
  await recordPricingCatalogAudit(admin, {
    tableName: "pricing_extras",
    rowId: id,
    action: "update",
    beforeRow: (before as Record<string, unknown> | null) ?? null,
    afterRow: (afterRows?.[0] as Record<string, unknown> | undefined) ?? null,
    actorUserId: auth.user.id,
    actorEmail: auth.email,
  });

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  let body: {
    slug?: unknown;
    name?: unknown;
    price?: unknown;
    service_type?: unknown;
    is_popular?: unknown;
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
  const price = typeof body.price === "number" && Number.isFinite(body.price) ? Math.max(0, Math.round(body.price)) : 0;

  if (!slug) return NextResponse.json({ error: "slug required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });

  const serviceTypeRaw = typeof body.service_type === "string" ? body.service_type.trim().toLowerCase() : "all";
  const service_type = SERVICE_TYPES.has(serviceTypeRaw) ? serviceTypeRaw : "all";

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: maxRow } = await admin
    .from("pricing_extras")
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
    price,
    service_type,
    is_popular: body.is_popular === true,
    is_active: body.is_active !== false,
    sort_order: nextSort,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.from("pricing_extras").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { recordPricingCatalogAudit } = await import("@/lib/admin/recordPricingCatalogAudit");
  await recordPricingCatalogAudit(admin, {
    tableName: "pricing_extras",
    rowId: String((data as { id?: string }).id ?? slug),
    action: "insert",
    afterRow: data as Record<string, unknown>,
    actorUserId: auth.user.id,
    actorEmail: auth.email,
  });

  return NextResponse.json({ ok: true, extra: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id query param required." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: before } = await admin.from("pricing_extras").select("*").eq("id", id).maybeSingle();
  const { error } = await admin.from("pricing_extras").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { recordPricingCatalogAudit } = await import("@/lib/admin/recordPricingCatalogAudit");
  await recordPricingCatalogAudit(admin, {
    tableName: "pricing_extras",
    rowId: id,
    action: "delete",
    beforeRow: (before as Record<string, unknown> | null) ?? null,
    actorUserId: auth.user.id,
    actorEmail: auth.email,
  });

  return NextResponse.json({ ok: true });
}
